"""Eventarc webhook routes — /api/eventarc/*
Receives CloudEvents from Firebase Eventarc triggers.
The case-generation-triggered event fires on every write to /cases/{caseId}.
This worker picks up cases with status='pending' and runs AI generation,
writing results back to Firebase RTDB in progressive chunks.

Supports partial resume: if a previous attempt partially completed
(e.g., text was generated but images weren't), the handler skips
already-completed work on retry.
"""
from __future__ import annotations
import asyncio
import time
import traceback
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from firebase_admin import db as rtdb

from ..services.gemini_case_core import generate_case_from_prompt
from ..services.gemini_images import pregenerate_case_images

router = APIRouter(prefix="/api/eventarc")

# Lease duration in ms — each chunk write extends the lease by this amount
LEASE_DURATION_MS = 5 * 60 * 1000  # 5 minutes


def _get_db():
    return rtdb.reference()


def _now_ms() -> int:
    return int(time.time() * 1000)


def _extend_lease(case_ref, extra_fields: dict | None = None) -> None:
    """Extend leaseUntil on the case to signal active processing."""
    update = {
        "leaseUntil": _now_ms() + LEASE_DURATION_MS,
        "updatedAt": _now_ms(),
    }
    if extra_fields:
        update.update(extra_fields)
    case_ref.update(update)


def _extract_case_id_from_subject(subject: str) -> str | None:
    """Extract caseId from CloudEvents ce-subject header.
    Expected format: refs/cases/{caseId} or /cases/{caseId}
    """
    if not subject:
        return None
    # Strip leading 'refs/' if present
    path = subject.removeprefix("refs/").strip("/")
    parts = path.split("/")
    # We expect: cases/{caseId} or cases/{caseId}/...
    if len(parts) >= 2 and parts[0] == "cases":
        return parts[1]
    return None


# ---------------------------------------------------------------------------
# Partial resume detection
# ---------------------------------------------------------------------------

def _has_portrait_url(portraits: dict | None, key: str) -> bool:
    """Check if a portrait key has a real URL (not placeholder)."""
    if not portraits or not isinstance(portraits, dict):
        return False
    val = portraits.get(key)
    return bool(val and isinstance(val, str) and val != "PLACEHOLDER" and val.startswith("http"))


def _detect_generation_state(case_data: dict) -> dict[str, Any]:
    """Inspect a case to determine what generation work has already been completed.

    Returns a dict describing the completion state so the handler can skip
    already-finished work on retry.
    """
    suspects = case_data.get("suspects") or []
    initial_evidence = case_data.get("initialEvidence") or []

    # --- Text completeness ---
    has_title = bool(case_data.get("title", "").strip())
    has_suspects = len(suspects) > 0 and any(s.get("name") for s in suspects if isinstance(s, dict))
    has_evidence = len(initial_evidence) > 0
    has_timeline = len(case_data.get("initialTimeline") or []) > 0
    has_officer = bool(case_data.get("officer") and isinstance(case_data["officer"], dict) and case_data["officer"].get("name"))
    has_partner = bool(case_data.get("partner") and isinstance(case_data["partner"], dict) and case_data["partner"].get("name"))

    text_complete = all([has_title, has_suspects, has_evidence, has_timeline, has_officer, has_partner])

    # --- Image completeness per suspect ---
    suspects_with_neutrals: list[str] = []
    suspects_needing_neutrals: list[str] = []
    suspects_with_all_variants: list[str] = []
    suspects_needing_variants: list[str] = []

    for s in suspects:
        if not isinstance(s, dict):
            continue
        sid = s.get("id", "")
        portraits = s.get("portraits")
        if _has_portrait_url(portraits, "NEUTRAL"):
            suspects_with_neutrals.append(sid)
            # Check if all expected variants exist
            # Living suspects need emotional variants; deceased need forensic
            if s.get("isDeceased"):
                expected = ["HEAD", "TORSO", "HANDS", "LEGS", "ENVIRONMENT"]
            else:
                expected = ["HAPPY", "ANGRY", "SAD", "NERVOUS", "SURPRISED", "SLY", "CONTENT", "DEFENSIVE", "ARROGANT"]
            has_all = all(_has_portrait_url(portraits, v) for v in expected)
            if has_all:
                suspects_with_all_variants.append(sid)
            else:
                suspects_needing_variants.append(sid)
        else:
            suspects_needing_neutrals.append(sid)
            suspects_needing_variants.append(sid)

    # --- Evidence images ---
    evidence_with_images: list[str] = []
    evidence_needing_images: list[str] = []
    for ev in initial_evidence:
        if not isinstance(ev, dict):
            continue
        eid = ev.get("id", "")
        if ev.get("imageUrl") and isinstance(ev["imageUrl"], str) and ev["imageUrl"].startswith("http"):
            evidence_with_images.append(eid)
        else:
            evidence_needing_images.append(eid)

    # Hidden evidence per suspect
    hidden_evidence_with_images: list[str] = []
    hidden_evidence_needing_images: list[str] = []
    for s in suspects:
        if not isinstance(s, dict):
            continue
        for ev in s.get("hiddenEvidence") or []:
            if not isinstance(ev, dict):
                continue
            eid = ev.get("id", "")
            if ev.get("imageUrl") and isinstance(ev["imageUrl"], str) and ev["imageUrl"].startswith("http"):
                hidden_evidence_with_images.append(eid)
            else:
                hidden_evidence_needing_images.append(eid)

    # --- Officer / partner portraits ---
    has_officer_portrait = bool(
        case_data.get("officer")
        and isinstance(case_data["officer"], dict)
        and _has_portrait_url(case_data["officer"].get("portraits"), "NEUTRAL")
    )
    has_partner_portrait = bool(
        case_data.get("partner")
        and isinstance(case_data["partner"], dict)
        and _has_portrait_url(case_data["partner"].get("portraits"), "NEUTRAL")
    )

    images_complete = (
        len(suspects_needing_neutrals) == 0
        and len(suspects_needing_variants) == 0
        and len(evidence_needing_images) == 0
        and len(hidden_evidence_needing_images) == 0
        and (has_officer_portrait or not has_officer)
        and (has_partner_portrait or not has_partner)
    )

    return {
        "text_complete": text_complete,
        "images_complete": images_complete,
        "has_title": has_title,
        "has_suspects": has_suspects,
        "has_evidence": has_evidence,
        "has_timeline": has_timeline,
        "has_officer": has_officer,
        "has_partner": has_partner,
        "suspects_with_neutrals": suspects_with_neutrals,
        "suspects_needing_neutrals": suspects_needing_neutrals,
        "suspects_with_all_variants": suspects_with_all_variants,
        "suspects_needing_variants": suspects_needing_variants,
        "evidence_with_images": evidence_with_images,
        "evidence_needing_images": evidence_needing_images,
        "hidden_evidence_with_images": hidden_evidence_with_images,
        "hidden_evidence_needing_images": hidden_evidence_needing_images,
        "has_officer_portrait": has_officer_portrait,
        "has_partner_portrait": has_partner_portrait,
    }


# ---------------------------------------------------------------------------
# Main handler
# ---------------------------------------------------------------------------

@router.post("/case-written")
async def handle_case_written(request: Request):
    """
    POST /api/eventarc/case-written
    Receives CloudEvents from Eventarc when data is written to /cases/{caseId}.
    Only processes cases with status='pending'.
    Runs AI generation and writes results progressively.
    Supports resuming from partial completion on retry.
    """
    # --- 1. Extract caseId from CloudEvents headers ---
    ce_type = request.headers.get("ce-type", "")
    ce_subject = request.headers.get("ce-subject", "")

    print(f"[Eventarc] Received event: type={ce_type}, subject={ce_subject}")

    if ce_type != "google.firebase.database.ref.v1.written":
        print(f"[Eventarc] Ignoring non-write event: {ce_type}")
        return {"status": "ignored", "reason": "not a write event"}

    case_id = _extract_case_id_from_subject(ce_subject)
    if not case_id:
        print(f"[Eventarc] Could not extract caseId from subject: {ce_subject}")
        return JSONResponse({"error": "Could not extract caseId from event subject"}, status_code=400)

    print(f"[Eventarc] Processing case: {case_id}")

    # --- 2. Read the case and check status ---
    case_ref = _get_db().child(f"cases/{case_id}")
    case_data = case_ref.get()

    if not case_data or not isinstance(case_data, dict):
        print(f"[Eventarc] Case {case_id} not found in RTDB")
        return {"status": "ignored", "reason": "case not found"}

    status = case_data.get("status")
    if status != "pending":
        print(f"[Eventarc] Case {case_id} status is '{status}', not 'pending' — skipping")
        return {"status": "ignored", "reason": f"status is {status}"}

    # --- 3. Detect what's already been generated (for resume) ---
    gen_state = _detect_generation_state(case_data)
    is_resume = gen_state["text_complete"]

    if is_resume:
        print(
            f"[Eventarc] Case {case_id}: RESUMING — text already complete. "
            f"Neutrals needed: {len(gen_state['suspects_needing_neutrals'])}, "
            f"Variants needed: {len(gen_state['suspects_needing_variants'])}, "
            f"Evidence images needed: {len(gen_state['evidence_needing_images'])}"
        )
    else:
        print(f"[Eventarc] Case {case_id}: Starting fresh generation")

    # --- 4. Claim the case: set status=in-progress + lease ---
    claim_fields: dict[str, Any] = {
        "status": "in-progress",
        "generationStep": "ai-thinking" if not is_resume else "generating-images",
        "generationPhase": "text" if not is_resume else "images",
    }
    _extend_lease(case_ref, claim_fields)
    print(f"[Eventarc] Claimed case {case_id}: status=in-progress (resume={is_resume})")

    prompt = case_data.get("generationPrompt", "")
    is_lucky = case_data.get("generationIsLucky", False)
    author_id = case_data.get("authorId", "")

    # --- 5. Generate case text (skip if resuming with complete text) ---
    if not is_resume:
        try:
            generated = await generate_case_from_prompt(prompt, is_lucky)
            print(f"[Eventarc] AI generation complete for {case_id}: title=\"{generated.get('title')}\"")
            case_ref.update({"generationStep": "writing-chunks", "updatedAt": _now_ms()})
        except Exception as e:
            print(f"[Eventarc] AI generation FAILED for {case_id}: {e}")
            traceback.print_exc()
            case_ref.update({
                "status": "failed",
                "generationStep": None,
                "generationError": str(e)[:500],
                "updatedAt": _now_ms(),
            })
            return JSONResponse({"error": f"Generation failed: {e}"}, status_code=500)

        # --- 6. Progressive writes — write chunks and extend lease between each ---

        # Preserve metadata from the stub (authorId, etc.)
        generated["id"] = case_id
        generated["authorId"] = author_id
        generated["authorDisplayName"] = case_data.get("authorDisplayName", "")
        generated["createdAt"] = case_data.get("createdAt", _now_ms())
        generated["isUploaded"] = False

        try:
            # Chunk 1: Title, type, description, difficulty, startTime, hasVictim, partnerCharges
            print(f"[Eventarc] {case_id}: Writing chunk 1/6 — case overview")
            case_ref.update({
                "title": generated.get("title", ""),
                "type": generated.get("type", ""),
                "description": generated.get("description", ""),
                "difficulty": generated.get("difficulty", "Medium"),
                "startTime": generated.get("startTime"),
                "hasVictim": generated.get("hasVictim", False),
                "partnerCharges": generated.get("partnerCharges", 3),
                "leaseUntil": _now_ms() + LEASE_DURATION_MS,
                "updatedAt": _now_ms(),
                "progress": 15,
            })
            await asyncio.sleep(0)  # Yield to event loop

            # Chunk 2: Suspects (the largest payload — includes profiles, alibis, timelines, evidence)
            print(f"[Eventarc] {case_id}: Writing chunk 2/6 — suspects ({len(generated.get('suspects', []))} total)")
            case_ref.update({
                "suspects": generated.get("suspects", []),
                "leaseUntil": _now_ms() + LEASE_DURATION_MS,
                "updatedAt": _now_ms(),
                "progress": 30,
            })
            await asyncio.sleep(0)

            # Chunk 3: Initial evidence
            print(f"[Eventarc] {case_id}: Writing chunk 3/6 — initial evidence ({len(generated.get('initialEvidence', []))} items)")
            case_ref.update({
                "initialEvidence": generated.get("initialEvidence", []),
                "leaseUntil": _now_ms() + LEASE_DURATION_MS,
                "updatedAt": _now_ms(),
                "progress": 45,
            })
            await asyncio.sleep(0)

            # Chunk 4: Initial timeline
            print(f"[Eventarc] {case_id}: Writing chunk 4/6 — timeline ({len(generated.get('initialTimeline', []))} events)")
            case_ref.update({
                "initialTimeline": generated.get("initialTimeline", []),
                "leaseUntil": _now_ms() + LEASE_DURATION_MS,
                "updatedAt": _now_ms(),
                "progress": 60,
            })
            await asyncio.sleep(0)

            # Chunk 5: Officer, partner
            print(f"[Eventarc] {case_id}: Writing chunk 5/6 — officer, partner")
            case_ref.update({
                "officer": generated.get("officer"),
                "partner": generated.get("partner"),
                "leaseUntil": _now_ms() + LEASE_DURATION_MS,
                "updatedAt": _now_ms(),
                "progress": 75,
            })
            await asyncio.sleep(0)

        except Exception as e:
            print(f"[Eventarc] Chunk write FAILED for {case_id}: {e}")
            traceback.print_exc()
            case_ref.update({
                "status": "failed",
                "generationError": f"Chunk write failed: {str(e)[:400]}",
                "updatedAt": _now_ms(),
            })
            return JSONResponse({"error": f"Chunk write failed: {e}"}, status_code=500)

        # Use freshly written data as the full case for image gen
        full_case = {
            **generated,
            "id": case_id,
            "authorId": author_id,
        }
    else:
        # Resuming: use existing data as the full case
        full_case = {
            **case_data,
            "id": case_id,
            "authorId": author_id,
        }

    # --- 7. Image generation phase (with partial resume support) ---
    print(f"[Eventarc] {case_id}: Starting chunk 6/6 — image generation")
    case_ref.update({"generationPhase": "images", "generationStep": "generating-images", "updatedAt": _now_ms()})
    _extend_lease(case_ref)  # Fresh lease for the long image phase

    try:
        await _resume_image_generation(full_case, author_id, case_id, case_ref, gen_state)
        print(f"[Eventarc] {case_id}: Image generation complete")
    except Exception as img_err:
        # Image generation failure is non-fatal — the case text is still usable
        print(f"[Eventarc] {case_id}: Image generation failed (non-fatal): {img_err}")
        traceback.print_exc()

    # Write images back to the case (portraits are set on the full_case dict by pregenerate)
    _extend_lease(case_ref)
    image_update: dict = {"updatedAt": _now_ms(), "progress": 90}

    # Write suspect portraits and evidence images
    if full_case.get("suspects"):
        image_update["suspects"] = full_case["suspects"]
    if full_case.get("initialEvidence"):
        image_update["initialEvidence"] = full_case["initialEvidence"]
    if full_case.get("officer"):
        image_update["officer"] = full_case["officer"]
    if full_case.get("partner"):
        image_update["partner"] = full_case["partner"]
    if full_case.get("heroImageUrl"):
        image_update["heroImageUrl"] = full_case["heroImageUrl"]

    case_ref.update(image_update)
    print(f"[Eventarc] {case_id}: Image data written to RTDB")

    # Final: mark completed
    case_ref.update({
        "status": "completed",
        "progress": 100,
        "generationPhase": None,
        "generationStep": None,
        "leaseUntil": None,
        "generationPrompt": None,
        "generationIsLucky": None,
        "generationError": None,
        "updatedAt": _now_ms(),
    })

    print(f"[Eventarc] ✅ Case {case_id} generation COMPLETE (with images)")
    return {"status": "completed", "caseId": case_id}


# ---------------------------------------------------------------------------
# Partial image generation resume
# ---------------------------------------------------------------------------

async def _resume_image_generation(
    full_case: dict,
    user_id: str,
    case_id: str,
    case_ref: Any,
    gen_state: dict,
) -> None:
    """Run image generation, skipping work that was already completed in a
    previous attempt.  If no previous work exists, this behaves identically
    to the original `pregenerate_case_images` call.
    """
    if gen_state["images_complete"]:
        print(f"[Eventarc] {case_id}: All images already generated — skipping image phase entirely")
        return

    # If nothing was done yet, use the original bulk pipeline
    if not gen_state["suspects_with_neutrals"] and not gen_state["has_officer_portrait"] and not gen_state["has_partner_portrait"]:
        print(f"[Eventarc] {case_id}: No partial images found — running full image pipeline")
        await pregenerate_case_images(full_case, user_id)
        return

    # --- Partial resume: surgically generate only missing pieces ---
    print(f"[Eventarc] {case_id}: Partial image resume — generating only missing images")
    _extend_lease(case_ref)

    from ..services.gemini_images import (
        generate_neutral_portrait_for_suspect,
        generate_emotional_variants_from_base,
        generate_evidence_image,
        Emotion,
    )
    from ..services.gemini_styles import STYLE_REF_URL
    from ..services.gemini_models import GEMINI_MODELS
    from ..services.gemini_images import generate_image_raw, _upload_image, _build_victim_prompt
    from ..services.gemini_styles import (
        PIXEL_ART_BASE,
        LIVING_CHARACTER_PORTRAIT_FRAMING,
    )

    suspects = full_case.get("suspects") or []
    case_theme = full_case.get("type", "Noir")

    # Phase 1: Generate missing neutral portraits
    if gen_state["suspects_needing_neutrals"]:
        print(f"[Eventarc] {case_id}: Generating {len(gen_state['suspects_needing_neutrals'])} missing neutral portraits")
        for s in suspects:
            if not isinstance(s, dict) or s.get("id") not in gen_state["suspects_needing_neutrals"]:
                continue
            try:
                result = await generate_neutral_portrait_for_suspect(s, case_id, user_id, case_theme)
                s.setdefault("portraits", {})["NEUTRAL"] = result["neutralUrl"]
                _extend_lease(case_ref)
            except Exception as e:
                print(f"[Eventarc] {case_id}: Failed to generate neutral for {s.get('name')}: {e}")

    # Generate officer portrait if missing
    if not gen_state["has_officer_portrait"] and full_case.get("officer"):
        print(f"[Eventarc] {case_id}: Generating missing officer portrait")
        try:
            o = full_case["officer"]
            style_refs = [STYLE_REF_URL] if STYLE_REF_URL else []
            prompt = f"Subject: Portrait of a {o.get('gender', '')} {o.get('role', '')} named {o.get('name', '')}. Theme: {case_theme}. Expression: Stern, commanding. Background: Office or Command Center. Composition: Front-facing mugshot, full-bleed. {LIVING_CHARACTER_PORTRAIT_FRAMING} {PIXEL_ART_BASE}"
            b64 = await generate_image_raw(prompt, "3:4", style_refs, "create", GEMINI_MODELS["IMAGE_HD"])
            if b64:
                url = await _upload_image(b64, f"images/{user_id}/cases/{case_id}/officer.png")
                o.setdefault("portraits", {})["NEUTRAL"] = url
            _extend_lease(case_ref)
        except Exception as e:
            print(f"[Eventarc] {case_id}: Failed to generate officer portrait: {e}")

    # Generate partner portrait if missing
    if not gen_state["has_partner_portrait"] and full_case.get("partner"):
        print(f"[Eventarc] {case_id}: Generating missing partner portrait")
        try:
            p = full_case["partner"]
            style_refs = [STYLE_REF_URL] if STYLE_REF_URL else []
            prompt = f"Subject: Portrait of a {p.get('gender', '')} {p.get('role', '')} named {p.get('name', '')}. Theme: {case_theme}. Expression: Eager, helpful. Background: City street or tech lab. Composition: Front-facing mugshot, full-bleed. {LIVING_CHARACTER_PORTRAIT_FRAMING} {PIXEL_ART_BASE}"
            b64 = await generate_image_raw(prompt, "3:4", style_refs, "create", GEMINI_MODELS["IMAGE_HD"])
            if b64:
                url = await _upload_image(b64, f"images/{user_id}/cases/{case_id}/partner/neutral.png")
                p.setdefault("portraits", {})["NEUTRAL"] = url
            _extend_lease(case_ref)
        except Exception as e:
            print(f"[Eventarc] {case_id}: Failed to generate partner portrait: {e}")

    # Phase 2: Generate missing evidence images
    all_evidence_ids_needing = set(gen_state["evidence_needing_images"] + gen_state["hidden_evidence_needing_images"])
    if all_evidence_ids_needing:
        print(f"[Eventarc] {case_id}: Generating {len(all_evidence_ids_needing)} missing evidence images")

        for ev in full_case.get("initialEvidence") or []:
            if not isinstance(ev, dict) or ev.get("id") not in all_evidence_ids_needing:
                continue
            try:
                url = await generate_evidence_image(ev, case_id, user_id, None, {"caseTheme": case_theme})
                if url:
                    ev["imageUrl"] = url
                _extend_lease(case_ref)
            except Exception as e:
                print(f"[Eventarc] {case_id}: Failed to generate evidence image for {ev.get('id')}: {e}")

        for s in suspects:
            if not isinstance(s, dict):
                continue
            s_neutral_url = (s.get("portraits") or {}).get("NEUTRAL")
            for ev in s.get("hiddenEvidence") or []:
                if not isinstance(ev, dict) or ev.get("id") not in all_evidence_ids_needing:
                    continue
                try:
                    url = await generate_evidence_image(
                        ev, case_id, user_id,
                        s_neutral_url if s.get("isDeceased") else None,
                        {"forDeceasedVictim": True, "caseTheme": case_theme} if s.get("isDeceased") else None,
                    )
                    if url:
                        ev["imageUrl"] = url
                    _extend_lease(case_ref)
                except Exception as e:
                    print(f"[Eventarc] {case_id}: Failed to generate hidden evidence image for {ev.get('id')}: {e}")

    # Phase 3: Generate missing emotional / forensic variants
    if gen_state["suspects_needing_variants"]:
        print(f"[Eventarc] {case_id}: Generating missing variants for {len(gen_state['suspects_needing_variants'])} suspects")
        for s in suspects:
            if not isinstance(s, dict) or s.get("id") not in gen_state["suspects_needing_variants"]:
                continue
            portraits = s.get("portraits") or {}
            neutral_url = portraits.get("NEUTRAL")
            if not neutral_url or not isinstance(neutral_url, str) or not neutral_url.startswith("http"):
                print(f"[Eventarc] {case_id}: Skipping variants for {s.get('name')} — no neutral portrait")
                continue

            try:
                # Generate the full emotional/forensic variant set, then upload
                variant_portraits = await generate_emotional_variants_from_base(
                    neutral_url, s, case_id, user_id,
                    {"caseTheme": case_theme},
                )
                # Merge — keep existing, add missing
                for key, url in variant_portraits.items():
                    if not _has_portrait_url(portraits, key):
                        portraits[key] = url
                s["portraits"] = portraits
                _extend_lease(case_ref)
            except Exception as e:
                print(f"[Eventarc] {case_id}: Failed to generate variants for {s.get('name')}: {e}")

    # Generate partner variants if partner has neutral but not variants
    if full_case.get("partner"):
        p = full_case["partner"]
        p_portraits = p.get("portraits") or {}
        p_neutral = p_portraits.get("NEUTRAL")
        if p_neutral and isinstance(p_neutral, str) and p_neutral.startswith("http"):
            expected_partner = ["HAPPY", "ANGRY", "SAD", "NERVOUS", "SURPRISED", "SLY", "CONTENT", "DEFENSIVE", "ARROGANT"]
            missing_partner = [e for e in expected_partner if not _has_portrait_url(p_portraits, e)]
            if missing_partner:
                print(f"[Eventarc] {case_id}: Generating {len(missing_partner)} missing partner variants")
                try:
                    variant_portraits = await generate_emotional_variants_from_base(
                        p_neutral, p, case_id, user_id,
                        {"caseTheme": case_theme},
                    )
                    for key, url in variant_portraits.items():
                        if not _has_portrait_url(p_portraits, key):
                            p_portraits[key] = url
                    p["portraits"] = p_portraits
                    _extend_lease(case_ref)
                except Exception as e:
                    print(f"[Eventarc] {case_id}: Failed to generate partner variants: {e}")

    # Phase 4: Hero image (same logic as pregenerate_case_images)
    if not full_case.get("heroImageUrl"):
        victim = next((s for s in suspects if isinstance(s, dict) and s.get("isDeceased")), None)
        if victim and victim.get("portraits", {}).get("NEUTRAL"):
            full_case["heroImageUrl"] = victim["portraits"]["NEUTRAL"]
        elif full_case.get("initialEvidence") and isinstance(full_case["initialEvidence"], list) and full_case["initialEvidence"][0].get("imageUrl"):
            full_case["heroImageUrl"] = full_case["initialEvidence"][0]["imageUrl"]
