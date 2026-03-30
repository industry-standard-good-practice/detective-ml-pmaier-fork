"""
Core AI case functions: check_case_consistency, edit_case_with_prompt, generate_case_from_prompt.
Also image pipeline helpers for consistency runs.
"""
from __future__ import annotations
import asyncio
import copy
import json
import math
import random
import re
import time
from typing import Any

from .gemini_client import ai
from .gemini_models import GEMINI_MODELS, generate_with_text_model
from .gemini_images import (
    generate_evidence_image,
    regenerate_single_suspect,
    ensure_victim_examination_portraits,
)
from .victim_portrait_key import infer_victim_portrait_key_for_evidence, environment_scene_portrait_key
from .gemini_case_prompts import PROMPT_RULES, CASE_SCHEMA, REPORT_SCHEMA, CASE_GENERATION_SCHEMA
from .gemini_case import (
    TTS_VOICES, get_random_voice,
    generate_voice_style, generate_voice_styles, enforce_voice_styles,
    calculate_difficulty, compute_user_diff, format_user_change_log,
    apply_user_diff, _requires_narrative_propagation,
    strip_images_from_case, hydrate_images_to_case,
    enforce_relationships, enforce_timelines,
    enforce_start_time_alignment, ensure_brought_in_entry, enforce_suspect_schema,
)


# --- Image invalidation helpers ---

def _invalidate_hidden_evidence_images_for_guilt_changes(final_case: dict, baseline: dict) -> None:
    for s in final_case.get("suspects", []):
        bs = next((b for b in baseline.get("suspects", []) if b.get("id") == s.get("id")), None)
        if not bs or bool(bs.get("isGuilty")) == bool(s.get("isGuilty")):
            continue
        for ev in s.get("hiddenEvidence", []):
            ev.pop("imageUrl", None)


def _invalidate_evidence_images_on_narrative_change(final_case: dict, baseline: dict, theme_changed: bool) -> None:
    def run(ev_list, orig_list):
        for ev in ev_list:
            orig = next((o for o in orig_list if o.get("id") == ev.get("id")), None)
            if orig:
                changed = (theme_changed or ev.get("title") != orig.get("title") or
                           ev.get("description") != orig.get("description") or
                           ev.get("location") != orig.get("location") or
                           ev.get("discoveryContext") != orig.get("discoveryContext") or
                           ev.get("environmentIncludesBody") != orig.get("environmentIncludesBody"))
                if changed:
                    ev.pop("imageUrl", None)
            else:
                ev.pop("imageUrl", None)
    run(final_case.get("initialEvidence", []), baseline.get("initialEvidence", []))
    for s in final_case.get("suspects", []):
        orig_s = next((o for o in baseline.get("suspects", []) if o.get("id") == s.get("id")), None)
        if orig_s:
            run(s.get("hiddenEvidence", []), orig_s.get("hiddenEvidence", []))


def _victim_needs_full_portrait_regen(s: dict, orig: dict | None, theme_changed: bool) -> bool:
    if not s.get("isDeceased"):
        return False
    if theme_changed:
        return True
    p = s.get("portraits")
    if not p:
        return True
    n = p.get("NEUTRAL")
    if not n or n == "PLACEHOLDER":
        return True
    if orig:
        for f in ("physicalDescription", "name", "role", "bio", "witnessObservations"):
            if (s.get(f) or "") != (orig.get(f) or ""):
                return True
    return False


def _refresh_victim_examination_portrait_keys(final_data: dict, original: dict) -> None:
    for s in final_data.get("suspects", []):
        if not s.get("isDeceased"):
            continue
        orig_s = next((o for o in original.get("suspects", []) if o.get("id") == s.get("id")), None)
        keys_to_clear: set[str] = set()
        for ev in s.get("hiddenEvidence", []):
            orig_ev = next((o for o in (orig_s or {}).get("hiddenEvidence", []) if o.get("id") == ev.get("id")), None) if orig_s else None
            key_now = infer_victim_portrait_key_for_evidence(ev)
            key_orig = infer_victim_portrait_key_for_evidence(orig_ev) if orig_ev else None
            if key_orig is not None and key_now != key_orig:
                ev.pop("imageUrl", None)
                keys_to_clear.add(key_now)
                keys_to_clear.add(key_orig)
            if ev.get("discoveryContext") == "environment" and orig_ev:
                changed = any(
                    (ev.get(f) or "") != (orig_ev.get(f) or "")
                    for f in ("location", "title", "description", "discoveryContext")
                ) or ev.get("environmentIncludesBody") != orig_ev.get("environmentIncludesBody")
                if changed:
                    keys_to_clear.add(environment_scene_portrait_key(ev.get("id", "")))
                    keys_to_clear.add(environment_scene_portrait_key(orig_ev.get("id", "")))
                    keys_to_clear.add("ENVIRONMENT")
        portraits = s.get("portraits")
        if not portraits or not keys_to_clear:
            continue
        for k in keys_to_clear:
            portraits.pop(k, None)


def _sync_hero_with_victim_neutral(final_data: dict, original: dict) -> None:
    orig_victim = next((s for s in original.get("suspects", []) if s.get("isDeceased")), None)
    victim = next((s for s in final_data.get("suspects", []) if s.get("isDeceased")), None)
    new_neutral = (victim or {}).get("portraits", {}).get("NEUTRAL")
    old_neutral = (orig_victim or {}).get("portraits", {}).get("NEUTRAL")
    if new_neutral and final_data.get("heroImageUrl") and old_neutral:
        if final_data["heroImageUrl"] == old_neutral:
            final_data["heroImageUrl"] = new_neutral


async def apply_consistency_image_pipeline(final_data: dict, original: dict, on_progress=None) -> dict:
    changes: list[dict] = []
    theme_changed = final_data.get("type") != original.get("type")
    _invalidate_evidence_images_on_narrative_change(final_data, original, theme_changed)
    _refresh_victim_examination_portrait_keys(final_data, original)

    user_id = final_data.get("authorId") or original.get("authorId")
    if not user_id:
        raise RuntimeError("[CRITICAL] applyConsistencyImagePipeline: authorId is required")

    # Victim full regen
    victim_tasks = []
    victim_names: list[str] = []
    for s in final_data.get("suspects", []):
        if not s.get("isDeceased"):
            continue
        orig = next((o for o in original.get("suspects", []) if o.get("id") == s.get("id")), None)
        if not _victim_needs_full_portrait_regen(s, orig, theme_changed):
            continue
        victim_names.append(s.get("name") or s.get("id", ""))
        async def regen(suspect=s):
            try:
                updated = await regenerate_single_suspect(suspect, final_data["id"], user_id, final_data.get("type", "Noir"))
                if updated.get("portraits"):
                    suspect["portraits"] = updated["portraits"]
            except Exception as e:
                print(f"Full victim portrait regen failed for {suspect.get('name')}: {e}")
        victim_tasks.append(regen())
    if victim_tasks:
        if on_progress: on_progress("Regenerating victim portraits...")
        await asyncio.gather(*victim_tasks)
        changes.append({"description": f"Regenerated full victim portrait set for: {', '.join(victim_names)}"})

    # Ensure examination portraits
    ensure_tasks = []
    for s in final_data.get("suspects", []):
        if not s.get("isDeceased"):
            continue
        async def ensure(suspect=s):
            try:
                return {"name": suspect.get("name", ""), "n": await ensure_victim_examination_portraits(suspect, final_data["id"], user_id, final_data.get("type", "Noir"))}
            except Exception as e:
                print(f"ensureVictimExaminationPortraits failed: {e}")
                return {"name": suspect.get("name", ""), "n": 0}
        ensure_tasks.append(ensure())
    if ensure_tasks:
        if on_progress: on_progress("Syncing victim examination views...")
        rows = await asyncio.gather(*ensure_tasks)
        hits = [r for r in rows if r["n"] > 0]
        if hits:
            view_desc = "; ".join("{} (+{})".format(h["name"], h["n"]) for h in hits)
            changes.append({"description": "Generated missing victim views: " + view_desc})

    # Evidence images
    ev_tasks = []
    for ev in final_data.get("initialEvidence", []):
        if not ev.get("imageUrl"):
            async def gen_ie(e=ev):
                try:
                    url = await generate_evidence_image(e, final_data["id"], user_id, None, {"caseTheme": final_data.get("type")})
                    if url: e["imageUrl"] = url; return {"title": e.get("title", ""), "id": e.get("id", "")}
                except Exception as err: print(f"Evidence image gen failed: {err}")
                return None
            ev_tasks.append(gen_ie())
    for s in final_data.get("suspects", []):
        victim_ref = s["portraits"].get("NEUTRAL") if s.get("isDeceased") and s.get("portraits") else None
        for ev in s.get("hiddenEvidence", []):
            if not ev.get("imageUrl"):
                async def gen_he(e=ev, _s=s, _ref=victim_ref):
                    try:
                        url = await generate_evidence_image(e, final_data["id"], user_id,
                            _ref if _s.get("isDeceased") else None,
                            {"forDeceasedVictim": True, "caseTheme": final_data.get("type")} if _s.get("isDeceased") else None)
                        if url: e["imageUrl"] = url; return {"title": e.get("title", ""), "id": e.get("id", "")}
                    except Exception as err: print(f"Evidence image gen failed: {err}")
                    return None
                ev_tasks.append(gen_he())
    if ev_tasks:
        if on_progress: on_progress("Generating evidence images...")
        results = await asyncio.gather(*ev_tasks)
        done = [r for r in results if r]
        if done:
            changes.append({"description": f"Regenerated {len(done)} evidence card image(s): {'; '.join(d['title'] for d in done)}"})

    _sync_hero_with_victim_neutral(final_data, original)
    return {"changesMade": changes}


def _merge_image_pipeline_into_report(report: Any, image_changes: list[dict]) -> Any:
    if not image_changes or not report or not isinstance(report, dict):
        return report
    existing = report.get("changesMade", []) if isinstance(report.get("changesMade"), list) else []
    return {**report, "changesMade": existing + image_changes}


# ---------- CORE PUBLIC FUNCTIONS ----------

async def check_case_consistency(case_data: dict, on_progress=None, baseline: dict | None = None,
                                  edit_context: str | None = None, options: dict | None = None) -> dict:
    print(f'[DEBUG] checkCaseConsistency: Starting for case "{case_data.get("title")}"')
    user_change_log = ""
    user_diff: dict = {}
    should_propagate = False
    if baseline:
        user_diff = compute_user_diff(baseline, case_data)
        user_change_log = format_user_change_log(user_diff, baseline)
        should_propagate = _requires_narrative_propagation(user_diff)

    if on_progress: on_progress("Stripping visual assets for analysis...")
    lightweight, image_map = strip_images_from_case(case_data)
    guilty = [s for s in case_data.get("suspects", []) if s.get("isGuilty")]
    guilty_names = ", ".join(s["name"] for s in guilty) if guilty else "Unknown"

    user_edits_section = f"""
    **0. USER MANUAL EDITS (HIGHEST PRIORITY — DO NOT REVERT):**
{user_change_log}""" if user_change_log else """
    **0. CURRENT DATA IS AUTHORITATIVE:**
       Focus on fixing logical/narrative gaps, timeline conflicts, and structural issues."""

    edit_ctx_section = f"""
    **IMPORTANT — CONTEXT TO PRESERVE:** "{edit_context}"
""" if edit_context else ""

    if on_progress: on_progress("Initializing Narrative Audit...")

    role = ("Narrative Consistency Refactorer" if should_propagate else "Continuity Proofreader — a careful, conservative editor")
    mission = ("Perform a targeted narrative synchronization pass." if should_propagate
               else "Perform a **minimalist quality-control pass**. Only fix ACTUAL ERRORS.")

    prompt = f"""You are a {role}.
    YOUR MISSION: {mission}
    {edit_ctx_section}{user_edits_section}
    **IMMUTABLE RULES:**
    1. NEVER CHANGE WHO IS GUILTY. isGuilty flags are LOCKED ({guilty_names}).
    2. {'PROPAGATE USER CHANGES.' if should_propagate else 'NEVER CHANGE THE STORY.'}
    3. NEVER ALTER MYSTERY DIFFICULTY.
    4. MINIMIZE COLLATERAL CHANGES.
    
    **FORMAT RULES:**
    {PROMPT_RULES['TIMELINE_FORMAT']}
    {PROMPT_RULES['EVIDENCE_DESCRIPTION_STYLE']}
    {PROMPT_RULES['EVIDENCE_LOCATION']}
    {PROMPT_RULES['TIMELINE_SOURCE_OF_TRUTH']}
    {PROMPT_RULES['TIMELINE_CONSISTENCY_AUDIT']}
    {PROMPT_RULES['DATA_COMPLETENESS']}
    {PROMPT_RULES['SUSPECT_PROFILES']}
    {PROMPT_RULES['RELATIONSHIP_QUALITY']}
    {PROMPT_RULES['INITIAL_TIMELINE_SPOILER_PROTECTION']}
    {PROMPT_RULES['BIO_SPOILER_PROTECTION']}
    {PROMPT_RULES['START_TIME_ALIGNMENT']}
    {PROMPT_RULES['OUTPUT_FORMAT_WITH_REPORT']}
    
    CASE DATA:
    {json.dumps(lightweight, indent=2)}"""

    try:
        async def try_gen(model):
            return await ai.aio.models.generate_content(model=model, contents=prompt, config={
                "response_mime_type": "application/json",
                "response_schema": {"type": "OBJECT", "properties": {"updatedCase": CASE_SCHEMA, "report": REPORT_SCHEMA}, "required": ["updatedCase", "report"]},
                "thinking_config": {"thinking_level": "HIGH"},
            })
        result = await generate_with_text_model(GEMINI_MODELS["CASE_ENGINE"], try_gen, "checkCaseConsistency")
        if on_progress: on_progress("Finalizing Narrative Repair...")
        text = result.text
        if not text:
            return {"updatedCase": case_data, "report": "No changes needed."}
        parsed = json.loads(text)
        ai_case = parsed.get("updatedCase")
        report_obj = parsed.get("report")
        if not ai_case:
            return {"updatedCase": case_data, "report": report_obj or "Failed."}
        hydrated = hydrate_images_to_case(ai_case, image_map)
        # Preserve metadata
        for f in ("id", "authorId", "authorDisplayName", "version", "isUploaded", "isFeatured", "createdAt", "difficulty", "partnerCharges"):
            if case_data.get(f) is not None: hydrated[f] = case_data[f]
        if not hydrated.get("startTime") and case_data.get("startTime"): hydrated["startTime"] = case_data["startTime"]
        if not hydrated.get("heroImageUrl") and case_data.get("heroImageUrl"): hydrated["heroImageUrl"] = case_data["heroImageUrl"]
        if hydrated.get("hasVictim") is None:
            hydrated["hasVictim"] = any(s.get("isDeceased") for s in hydrated.get("suspects", []))
        # Merge support characters
        for key in ("officer", "partner"):
            ac, oc = hydrated.get(key), case_data.get(key)
            if ac and oc:
                merged = {**oc}
                for f in ("name", "role", "gender", "personality"):
                    if ac.get(f): merged[f] = ac[f]
                hydrated[key] = merged
        # Merge suspects
        for s in hydrated.get("suspects", []):
            orig = next((o for o in case_data.get("suspects", []) if o.get("id") == s.get("id")), None)
            if orig:
                if s.get("avatarSeed") is None: s["avatarSeed"] = orig.get("avatarSeed")
                if s.get("voice") is None: s["voice"] = orig.get("voice")
                if not s.get("portraits"): s["portraits"] = orig.get("portraits")
        # Safety net: restore guilt flags
        for s in hydrated.get("suspects", []):
            orig = next((o for o in case_data.get("suspects", []) if o.get("id") == s.get("id")), None)
            if orig:
                if s.get("isGuilty") != orig.get("isGuilty"): s["isGuilty"] = orig["isGuilty"]
                if s.get("isDeceased") != orig.get("isDeceased"): s["isDeceased"] = orig["isDeceased"]

        final = ensure_brought_in_entry(enforce_start_time_alignment(enforce_suspect_schema(enforce_timelines(enforce_relationships(hydrated)), case_data)))
        enforce_voice_styles(final, case_data)
        if baseline:
            ud = compute_user_diff(baseline, case_data)
            if ud: apply_user_diff(final, ud)
            _invalidate_hidden_evidence_images_for_guilt_changes(final, baseline)
        if (options or {}).get("narrativeOnly"):
            return {"updatedCase": final, "report": report_obj}
        img_audit = await apply_consistency_image_pipeline(final, case_data, on_progress)
        return {"updatedCase": final, "report": _merge_image_pipeline_into_report(report_obj, img_audit["changesMade"])}
    except Exception as e:
        print(f"Consistency Check Failed: {e}")
        return {"updatedCase": case_data, "report": "Consistency check failed."}


async def edit_case_with_prompt(case_data: dict, user_prompt: str, on_progress=None, baseline: dict | None = None) -> dict:
    print(f'[DEBUG] editCaseWithPrompt: Starting with prompt "{user_prompt}"')
    user_change_log = ""
    if baseline:
        ud = compute_user_diff(baseline, case_data)
        user_change_log = format_user_change_log(ud, baseline)

    if on_progress: on_progress("Stripping visual assets for transformation...")
    lightweight, image_map = strip_images_from_case(case_data)
    if on_progress: on_progress("Initializing Case Transformation...")

    user_edits = f"""**USER MANUAL EDITS (DO NOT REVERT):**\n{user_change_log}""" if user_change_log else "**CURRENT DATA IS AUTHORITATIVE.**"

    prompt = f"""You are a Master Narrative Architect.
    USER REQUEST: "{user_prompt}"
    {user_edits}
    GUIDELINES: Transform the case per the user's request. You MAY add/remove/modify suspects, change guilt, update evidence.
    {PROMPT_RULES['RELATIONSHIP_QUALITY']}
    {PROMPT_RULES['TIMELINE_FORMAT']}
    {PROMPT_RULES['TIMELINE_SOURCE_OF_TRUTH']}
    {PROMPT_RULES['INITIAL_TIMELINE_SPOILER_PROTECTION']}
    {PROMPT_RULES['NAMING_RULES']}
    {PROMPT_RULES['DATA_COMPLETENESS']}
    {PROMPT_RULES['SUSPECT_PROFILES']}
    {PROMPT_RULES['BIO_SPOILER_PROTECTION']}
    {PROMPT_RULES['START_TIME_ALIGNMENT']}
    {PROMPT_RULES['EVIDENCE_DESCRIPTION_STYLE']}
    {PROMPT_RULES['EVIDENCE_LOCATION']}
    {PROMPT_RULES['OUTPUT_FORMAT_WITH_REPORT']}
    
    CASE DATA:
    {json.dumps(lightweight, indent=2)}"""

    try:
        async def try_gen(model):
            return await ai.aio.models.generate_content(model=model, contents=prompt, config={
                "response_mime_type": "application/json",
                "response_schema": {"type": "OBJECT", "properties": {"updatedCase": CASE_SCHEMA, "report": REPORT_SCHEMA}, "required": ["updatedCase", "report"]},
                "thinking_config": {"thinking_level": "HIGH"},
            })
        result = await generate_with_text_model(GEMINI_MODELS["CASE_ENGINE"], try_gen, "editCaseWithPrompt")
        if on_progress: on_progress("Finalizing Case Transformation...")
        text = result.text
        if not text: raise RuntimeError("No response from AI")
        parsed = json.loads(text)
        ai_case, report_obj = parsed["updatedCase"], parsed.get("report")
        hydrated = hydrate_images_to_case(ai_case, image_map)
        for f in ("id", "authorId", "authorDisplayName", "version", "isUploaded", "isFeatured", "createdAt", "difficulty", "partnerCharges"):
            if case_data.get(f) is not None: hydrated[f] = case_data[f]
        if not hydrated.get("startTime") and case_data.get("startTime"): hydrated["startTime"] = case_data["startTime"]
        if hydrated.get("hasVictim") is None:
            hydrated["hasVictim"] = any(s.get("isDeceased") for s in hydrated.get("suspects", []))
        theme_changed = hydrated.get("type") != case_data.get("type")
        if theme_changed: hydrated.pop("heroImageUrl", None)
        # Merge support chars and suspects — same logic as consistency
        for key in ("officer", "partner"):
            ac, oc = hydrated.get(key), case_data.get(key)
            if ac and oc:
                merged = {**oc}
                for f in ("name", "role", "gender", "personality"): 
                    if ac.get(f): merged[f] = ac[f]
                if theme_changed or merged.get("role") != oc.get("role") or merged.get("name") != oc.get("name") or merged.get("personality") != oc.get("personality"):
                    merged["portraits"] = {}; merged["avatarSeed"] = random.randint(0, 999999)
                hydrated[key] = merged
        for s in hydrated.get("suspects", []):
            orig = next((o for o in case_data.get("suspects", []) if o.get("id") == s.get("id")), None)
            if orig:
                if theme_changed or s.get("role") != orig.get("role") or s.get("physicalDescription") != orig.get("physicalDescription") or s.get("name") != orig.get("name"):
                    s["portraits"] = {}; s["avatarSeed"] = random.randint(0, 999999)
                else:
                    s["portraits"] = orig.get("portraits", {}); s["avatarSeed"] = orig.get("avatarSeed")
                if s.get("voice") is None: s["voice"] = orig.get("voice")
            else:
                s.setdefault("id", f"s-new-{int(time.time()*1000)}-{random.randint(0,999)}")
                s["avatarSeed"] = random.randint(0, 999999); s["voice"] = get_random_voice(s.get("gender", "Unknown"))
                s["portraits"] = {}

        final = ensure_brought_in_entry(enforce_start_time_alignment(enforce_suspect_schema(enforce_timelines(enforce_relationships(hydrated)), case_data)))
        enforce_voice_styles(final, case_data)
        if baseline:
            ud = compute_user_diff(baseline, case_data)
            if ud: apply_user_diff(final, ud)
        # Generate images for new/changed content
        if on_progress: on_progress("Generating visual assets...")
        user_id = case_data.get("authorId")
        if not user_id: raise RuntimeError("authorId is required")
        gen_tasks = []
        for key in ("officer", "partner"):
            char = final.get(key)
            if char and (not char.get("portraits") or not char["portraits"]):
                async def regen_support(c=char):
                    try:
                        updated = await regenerate_single_suspect(c, final["id"], user_id, final.get("type", "Noir"))
                        if updated.get("portraits"): c["portraits"] = updated["portraits"]
                    except Exception as e: print(f"Portrait gen failed for {key}: {e}")
                gen_tasks.append(regen_support())
        for s in final.get("suspects", []):
            if not s.get("portraits") or not s["portraits"]:
                async def regen_suspect(suspect=s):
                    try:
                        updated = await regenerate_single_suspect(suspect, final["id"], user_id, final.get("type", "Noir"))
                        if updated.get("portraits"): suspect["portraits"] = updated["portraits"]
                    except Exception as e: print(f"Portrait gen failed: {e}")
                gen_tasks.append(regen_suspect())
        for ev in final.get("initialEvidence", []):
            if not ev.get("imageUrl"):
                async def gen_ie(e=ev):
                    try:
                        url = await generate_evidence_image(e, final["id"], user_id, None, {"caseTheme": final.get("type")})
                        if url: e["imageUrl"] = url
                    except Exception as err: print(f"Ev gen failed: {err}")
                gen_tasks.append(gen_ie())
        for s in final.get("suspects", []):
            vr = s["portraits"].get("NEUTRAL") if s.get("isDeceased") and s.get("portraits") else None
            for ev in s.get("hiddenEvidence", []):
                if not ev.get("imageUrl"):
                    async def gen_he(e=ev, _s=s, _ref=vr):
                        try:
                            url = await generate_evidence_image(e, final["id"], user_id, _ref if _s.get("isDeceased") else None,
                                {"forDeceasedVictim": True, "caseTheme": final.get("type")} if _s.get("isDeceased") else None)
                            if url: e["imageUrl"] = url
                        except Exception as err: print(f"Ev gen failed: {err}")
                    gen_tasks.append(gen_he())
        if gen_tasks: await asyncio.gather(*gen_tasks)
        # Ensure victim examination
        for s in final.get("suspects", []):
            if s.get("isDeceased"):
                try: await ensure_victim_examination_portraits(s, final["id"], user_id, final.get("type", "Noir"))
                except Exception as e: print(f"ensureVictimExam failed: {e}")
        return {"updatedCase": final, "report": report_obj}
    except Exception as e:
        print(f"Edit Case Failed: {e}")
        raise


async def generate_case_from_prompt(user_prompt: str, is_lucky: bool = False) -> dict:
    final_prompt = user_prompt
    if not final_prompt and is_lucky:
        final_prompt = "Generate a completely unique, creative, and random mystery theme."
    final_prompt = final_prompt or "A classic noir murder mystery"

    seed = random.randint(0, 999999)
    print(f'[DEBUG] generateCaseFromPrompt: "{final_prompt}" (Lucky: {is_lucky}, Seed: {seed})')

    system_prompt = f"""
    Create a detective case JSON.
    Theme: {final_prompt}. Generation Seed: {seed}.
    {PROMPT_RULES['INITIAL_TIMELINE_SPOILER_PROTECTION']}
    {PROMPT_RULES['TIMELINE_FORMAT']}
    {PROMPT_RULES['TIMELINE_SOURCE_OF_TRUTH']}
    CRITICAL: Generate officer and partner that fit the THEME.
    {PROMPT_RULES['NAMING_RULES']}
    {PROMPT_RULES['VICTIM_GENERATION']}
    {PROMPT_RULES['SUSPECT_PROFILES']}
    {PROMPT_RULES['RELATIONSHIP_QUALITY']}
    {PROMPT_RULES['DATA_COMPLETENESS']}
    {PROMPT_RULES['EVIDENCE_COUNTS']}
    {PROMPT_RULES['BIO_SPOILER_PROTECTION']}
    {PROMPT_RULES['VOICE_ACCENT']}
    {PROMPT_RULES['START_TIME_ALIGNMENT']}
    {PROMPT_RULES['EVIDENCE_DESCRIPTION_STYLE']}
    {PROMPT_RULES['EVIDENCE_LOCATION']}
    Output JSON structure matching CaseData interface.
    """

    res = await ai.aio.models.generate_content(
        model=GEMINI_MODELS["CASE_GENERATION"], contents=system_prompt,
        config={"response_mime_type": "application/json", "response_schema": CASE_GENERATION_SCHEMA},
    )
    data = json.loads(res.text)
    print(f"[DEBUG] generateCaseFromPrompt: Parsed JSON")

    # Post-process
    data["id"] = f"custom-{int(time.time() * 1000)}"
    data.setdefault("initialEvidence", [])
    for i, e in enumerate(data["initialEvidence"]):
        e["id"] = f"ie-{i}"
        if not isinstance(e.get("location"), str): e["location"] = ""
    data.setdefault("initialTimeline", [])
    data["difficulty"] = calculate_difficulty(data)
    if not data.get("startTime"): data["startTime"] = "2030-09-12T23:30"
    if data.get("partnerCharges") is None: data["partnerCharges"] = 3
    if data.get("hasVictim") is None:
        data["hasVictim"] = any(s.get("isDeceased") for s in data.get("suspects", []))
    # Officer
    if not data.get("officer"): data["officer"] = {"id": "officer", "name": "Chief", "gender": "Male", "role": "Police Chief", "personality": "Gruff"}
    data["officer"]["id"] = "officer"
    data["officer"]["avatarSeed"] = random.randint(0, 99999)
    data["officer"]["portraits"] = {}
    if not data["officer"].get("voice"): data["officer"]["voice"] = get_random_voice(data["officer"].get("gender", "Unknown"))
    # Partner
    if not data.get("partner"): data["partner"] = {"id": "partner", "name": "Al", "gender": "Male", "role": "Junior Detective", "personality": "Eager"}
    data["partner"]["id"] = "partner"
    data["partner"]["avatarSeed"] = random.randint(0, 99999)
    data["partner"]["portraits"] = {}
    if not data["partner"].get("voice"): data["partner"]["voice"] = get_random_voice(data["partner"].get("gender", "Unknown"))
    # Suspects
    data.setdefault("suspects", [])
    for i, s in enumerate(data["suspects"]):
        s["id"] = f"s-{i}"; s["portraits"] = {}
        s.setdefault("hiddenEvidence", [])
        for j, e in enumerate(s["hiddenEvidence"]):
            e["id"] = f"he-{s['id']}-{j}"
            if not isinstance(e.get("location"), str): e["location"] = ""
            if s.get("isDeceased"):
                if e.get("discoveryContext") not in ("environment", "body"): e["discoveryContext"] = "body"
                if e.get("discoveryContext") == "environment" and not isinstance(e.get("environmentIncludesBody"), bool): e["environmentIncludesBody"] = False
        if not s.get("voice") or s["voice"] == "None": s["voice"] = get_random_voice(s.get("gender", "Unknown"))
        if not s.get("gender"): s["gender"] = "Unknown"
        if not s.get("alibi"): s["alibi"] = {"statement": "I was home.", "isTrue": True, "location": "Home", "witnesses": []}
        for f in ("knownFacts", "timeline"): s.setdefault(f, [])
        for f in ("motive", "professionalBackground", "witnessObservations"):
            if not s.get(f): s[f] = "Unknown" if f != "witnessObservations" else "None"
        if not s.get("status"):
            if s.get("isDeceased"): s["status"] = "Deceased"
            else:
                agg = s.get("baseAggravation", 0)
                s["status"] = "Cooperative" if agg <= 25 else "Guarded" if agg <= 50 else "Tense" if agg <= 75 else "Hostile"

    final = ensure_brought_in_entry(enforce_start_time_alignment(enforce_suspect_schema(enforce_timelines(enforce_relationships(data)))))

    # Accent fallback
    def infer_default_accent(desc: str) -> str:
        t = desc.lower()
        patterns = [
            (r"\b(mexico|mexican|guadalajara)\b", "Mexican"), (r"\b(japan|japanese|tokyo)\b", "Japanese"),
            (r"\b(china|chinese|beijing|shanghai)\b", "Chinese"), (r"\b(india|indian|mumbai|delhi)\b", "Indian"),
            (r"\b(france|french|paris)\b", "French"), (r"\b(italy|italian|rome|milan)\b", "Italian"),
            (r"\b(spain|spanish|madrid)\b", "Spanish"), (r"\b(germany|german|berlin)\b", "German"),
            (r"\b(russia|russian|moscow)\b", "Russian"), (r"\b(australia|australian|sydney)\b", "Australian"),
            (r"\b(ireland|irish|dublin)\b", "Irish"), (r"\b(scotland|scottish)\b", "Scottish"),
            (r"\b(britain|british|london|england)\b", "British"), (r"\b(korea|korean|seoul)\b", "Korean"),
            (r"\b(new york|brooklyn|bronx)\b", "New York"), (r"\b(southern|dixie|georgia|louisiana)\b", "Southern American"),
        ]
        for p, a in patterns:
            if re.search(p, t): return a
        return "General American"

    ctx_accent = infer_default_accent(f"{data.get('title', '')} {data.get('description', '')} {data.get('type', '')}")
    for s in final.get("suspects", []):
        if not s.get("voiceAccent") or (isinstance(s.get("voiceAccent"), str) and not s["voiceAccent"].strip()):
            s["voiceAccent"] = ctx_accent
    for key in ("officer", "partner"):
        c = final.get(key)
        if c and (not c.get("voiceAccent") or not c["voiceAccent"].strip()):
            c["voiceAccent"] = ctx_accent

    generate_voice_styles(final)
    return final
