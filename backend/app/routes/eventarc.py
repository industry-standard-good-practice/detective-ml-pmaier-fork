"""Eventarc webhook routes — /api/eventarc/*
Receives CloudEvents from Firebase Eventarc triggers.
The case-generation-triggered event fires on every write to /cases/{caseId}.
This worker picks up cases with status='pending' and runs AI generation,
writing results back to Firebase RTDB in progressive chunks.
"""
from __future__ import annotations
import asyncio
import time
import traceback

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


@router.post("/case-written")
async def handle_case_written(request: Request):
    """
    POST /api/eventarc/case-written
    Receives CloudEvents from Eventarc when data is written to /cases/{caseId}.
    Only processes cases with status='pending'.
    Runs AI generation and writes results progressively.
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

    # --- 3. Claim the case: set status=in-progress + lease ---
    _extend_lease(case_ref, {"status": "in-progress"})
    print(f"[Eventarc] Claimed case {case_id}: status=in-progress")

    prompt = case_data.get("generationPrompt", "")
    is_lucky = case_data.get("generationIsLucky", False)
    author_id = case_data.get("authorId", "")

    # --- 4. Generate the case via AI ---
    try:
        generated = await generate_case_from_prompt(prompt, is_lucky)
        print(f"[Eventarc] AI generation complete for {case_id}: title=\"{generated.get('title')}\"")
    except Exception as e:
        print(f"[Eventarc] AI generation FAILED for {case_id}: {e}")
        traceback.print_exc()
        # Leave status=in-progress with expired lease for cron retry
        case_ref.update({
            "status": "failed",
            "generationError": str(e)[:500],
            "updatedAt": _now_ms(),
        })
        return JSONResponse({"error": f"Generation failed: {e}"}, status_code=500)

    # --- 5. Progressive writes — write chunks and extend lease between each ---

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

        # Chunk 6: Image generation — full pregeneration pipeline
        print(f"[Eventarc] {case_id}: Starting chunk 6/6 — image generation")
        _extend_lease(case_ref)  # Fresh lease for the long image phase

        # Build the full case dict for pregenerate_case_images
        full_case = {
            **generated,
            "id": case_id,
            "authorId": author_id,
        }

        try:
            await pregenerate_case_images(full_case, author_id)
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
            "leaseUntil": None,
            "generationPrompt": None,
            "generationIsLucky": None,
            "generationError": None,
            "updatedAt": _now_ms(),
        })

        print(f"[Eventarc] ✅ Case {case_id} generation COMPLETE (with images)")
        return {"status": "completed", "caseId": case_id}

    except Exception as e:
        print(f"[Eventarc] Chunk write FAILED for {case_id}: {e}")
        traceback.print_exc()
        case_ref.update({
            "status": "failed",
            "generationError": f"Chunk write failed: {str(e)[:400]}",
            "updatedAt": _now_ms(),
        })
        return JSONResponse({"error": f"Chunk write failed: {e}"}, status_code=500)
