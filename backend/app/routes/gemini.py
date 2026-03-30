"""Gemini AI routes — /api/gemini/*
Faithful port of src/routes/gemini.ts.
"""
from __future__ import annotations
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..services.gemini_chat import (
    get_suspect_response,
    get_case_summary,
    get_officer_response,
    get_partner_intervention,
    get_bad_cop_hint,
)
from ..services.gemini_case_core import (
    check_case_consistency,
    edit_case_with_prompt,
    generate_case_from_prompt,
    apply_consistency_image_pipeline,
)
from ..services.gemini_images import (
    generate_image_raw,
    generate_evidence_image,
    generate_emotional_variants_from_base,
    generate_one_portrait_variant_from_base,
    generate_suspect_from_upload,
    generate_neutral_portrait_for_suspect,
    regenerate_single_suspect,
    pregenerate_case_images,
    create_image_from_prompt,
    edit_image_with_prompt,
)
from ..services.gemini_tts import generate_tts

router = APIRouter(prefix="/api/gemini")


# --- CHAT ENDPOINTS ---

@router.post("/chat/suspect")
async def chat_suspect(request: Request):
    body = await request.json()
    try:
        # Build game_state from the flat fields the frontend sends
        game_state = {
            "aggravation": body.get("currentAggravation", 0),
            "isFirstTurn": body.get("isFirstTurn", False),
            "revealedEvidence": [e.get("title", "") for e in (body.get("discoveredEvidence") or []) if isinstance(e, dict)],
            "currentGameTime": body.get("currentGameTime"),
            "evidenceAttachment": body.get("evidenceAttachment"),
            "type": body.get("type", "talk"),
        }
        chat_history = body.get("conversationHistory") or []
        result = await get_suspect_response(
            body.get("suspect"), body.get("caseData"),
            game_state, chat_history, body.get("userInput", ""),
        )
        return result
    except Exception as e:
        print(f"[Gemini Route] chat/suspect error: {e}")
        return JSONResponse({"error": str(e) or "Failed to get suspect response"}, status_code=500)


@router.post("/chat/officer")
async def chat_officer(request: Request):
    body = await request.json()
    try:
        timeline_known = body.get("timelineKnown", [])
        if not isinstance(timeline_known, list):
            timeline_known = []
        officer_thread = body.get("officerThread", [])
        if not isinstance(officer_thread, list):
            officer_thread = []
        # Build game_state from the flat fields
        game_state = {
            "evidenceFound": body.get("evidenceFound", []),
            "notes": body.get("notes", {}),
            "chatHistory": body.get("chatHistory", {}),
            "timelineKnown": timeline_known,
            "officerThread": officer_thread,
        }
        result = await get_officer_response(
            body.get("caseData"), game_state,
            officer_thread, body.get("userMessage", ""),
        )
        return {"text": result}
    except Exception as e:
        print(f"[Gemini Route] chat/officer error: {e}")
        return JSONResponse({"error": str(e) or "Failed to get officer response"}, status_code=500)


@router.post("/chat/partner")
async def chat_partner(request: Request):
    body = await request.json()
    try:
        timeline_known = body.get("timelineKnown", [])
        if not isinstance(timeline_known, list):
            timeline_known = []
        # Build game_state from the flat fields
        game_state = {
            "aggravation": body.get("currentAggravation", 0),
            "discoveredEvidence": body.get("discoveredEvidence", []),
            "timelineKnown": timeline_known,
        }
        result = await get_partner_intervention(
            body.get("caseData"), body.get("suspect"),
            game_state, body.get("history", []),
            body.get("type", "goodCop"),
        )
        return {"text": result}
    except Exception as e:
        print(f"[Gemini Route] chat/partner error: {e}")
        return JSONResponse({"error": str(e) or "Failed to get partner intervention"}, status_code=500)


@router.post("/chat/badcop-hint")
async def chat_badcop_hint(request: Request):
    body = await request.json()
    try:
        discovered = body.get("discoveredEvidence", [])
        if not isinstance(discovered, list):
            discovered = []
        # Build game_state and chat_history from the flat fields
        game_state = {
            "discoveredEvidence": discovered,
        }
        result = await get_bad_cop_hint(
            body.get("caseData", {}), body.get("suspect"),
            game_state, body.get("chatHistory", []),
        )
        return {"text": result}
    except Exception as e:
        print(f"[Gemini Route] chat/badcop-hint error: {e}")
        return JSONResponse({"error": str(e) or "Failed to get bad cop hint"}, status_code=500)


@router.post("/chat/case-summary")
async def chat_case_summary(request: Request):
    body = await request.json()
    try:
        # Build game_state and accusation from the flat fields
        game_state = {
            "evidenceFound": len(body.get("evidenceDiscovered", [])),
            "suspectsSpoken": 0,
            "timelineFound": 0,
        }
        accusation = {
            "accusedIds": [body.get("accusedId")] if body.get("accusedId") else [],
        }
        result = await get_case_summary(
            body.get("caseData"), game_state, accusation,
        )
        return {"text": result}
    except Exception as e:
        print(f"[Gemini Route] chat/case-summary error: {e}")
        return JSONResponse({"error": str(e) or "Failed to generate case summary"}, status_code=500)


# --- CASE ENDPOINTS ---

@router.post("/case/generate")
async def case_generate(request: Request):
    body = await request.json()
    try:
        result = await generate_case_from_prompt(body.get("userPrompt", ""), body.get("isLucky", False))
        return result
    except Exception as e:
        print(f"[Gemini Route] case/generate error: {e}")
        return JSONResponse({"error": str(e) or "Failed to generate case"}, status_code=500)


@router.post("/case/consistency")
async def case_consistency(request: Request):
    body = await request.json()
    try:
        result = await check_case_consistency(
            body.get("caseData"), None, body.get("baseline"), body.get("editContext"),
        )
        return result
    except Exception as e:
        print(f"[Gemini Route] case/consistency error: {e}")
        return JSONResponse({"error": str(e) or "Failed to check case consistency"}, status_code=500)


@router.post("/case/consistency/narrative")
async def case_consistency_narrative(request: Request):
    """Narrative-only phase (no image regeneration). Pair with POST /case/consistency/images."""
    body = await request.json()
    try:
        result = await check_case_consistency(
            body.get("caseData"), None, body.get("baseline"),
            body.get("editContext"), {"narrativeOnly": True},
        )
        return result
    except Exception as e:
        print(f"[Gemini Route] case/consistency/narrative error: {e}")
        return JSONResponse({"error": str(e) or "Failed narrative consistency check"}, status_code=500)


@router.post("/case/consistency/images")
async def case_consistency_images(request: Request):
    """Image pipeline after narrative merge. Body: { mergedCase, originalCaseData }."""
    body = await request.json()
    merged_case = body.get("mergedCase")
    original_case_data = body.get("originalCaseData")
    if not merged_case or not original_case_data:
        return JSONResponse({"error": "mergedCase and originalCaseData are required"}, status_code=400)
    try:
        result = await apply_consistency_image_pipeline(merged_case, original_case_data)
        return {"updatedCase": merged_case, "imagePipelineChanges": result.get("changesMade", [])}
    except Exception as e:
        print(f"[Gemini Route] case/consistency/images error: {e}")
        return JSONResponse({"error": str(e) or "Failed consistency image pipeline"}, status_code=500)


@router.post("/case/edit")
async def case_edit(request: Request):
    body = await request.json()
    try:
        result = await edit_case_with_prompt(
            body.get("caseData"), body.get("userPrompt", ""),
            None, body.get("baseline"),
        )
        return result
    except Exception as e:
        print(f"[Gemini Route] case/edit error: {e}")
        return JSONResponse({"error": str(e) or "Failed to edit case"}, status_code=500)


# --- IMAGE ENDPOINTS ---

@router.post("/image/generate")
async def image_generate(request: Request):
    body = await request.json()
    try:
        result = await generate_image_raw(
            body.get("prompt", ""), body.get("aspectRatio"),
            body.get("refImages"), body.get("mode"), body.get("modelOverride"),
        )
        return {"base64": result}
    except Exception as e:
        print(f"[Gemini Route] image/generate error: {e}")
        return JSONResponse({"error": str(e) or "Failed to generate image"}, status_code=500)


@router.post("/image/evidence")
async def image_evidence(request: Request):
    body = await request.json()
    try:
        result = await generate_evidence_image(
            body.get("evidence"), body.get("caseId"), body.get("userId"),
            body.get("refImage"),
            {
                "forDeceasedVictim": bool(body.get("forDeceasedVictim")),
                "caseTheme": body.get("caseTheme") if isinstance(body.get("caseTheme"), str) else None,
            },
        )
        return {"url": result}
    except Exception as e:
        print(f"[Gemini Route] image/evidence error: {e}")
        return JSONResponse({"error": str(e) or "Failed to generate evidence image"}, status_code=500)


@router.post("/image/variants")
async def image_variants(request: Request):
    body = await request.json()
    try:
        result = await generate_emotional_variants_from_base(
            body.get("neutralBase64", ""), body.get("suspect"),
            body.get("caseId", ""), body.get("userId", ""),
            {"caseTheme": body.get("caseTheme") if isinstance(body.get("caseTheme"), str) else None},
        )
        return result
    except Exception as e:
        print(f"[Gemini Route] image/variants error: {e}")
        return JSONResponse({"error": str(e) or "Failed to generate emotional variants"}, status_code=500)


@router.post("/image/variant-one")
async def image_variant_one(request: Request):
    body = await request.json()
    variant_key = body.get("variantKey")
    if not variant_key or not isinstance(variant_key, str):
        return JSONResponse({"error": "variantKey is required"}, status_code=400)
    try:
        result = await generate_one_portrait_variant_from_base(
            body.get("neutralBase64", ""), variant_key, body.get("suspect"),
            body.get("caseId", ""), body.get("userId", ""),
            {"caseTheme": body.get("caseTheme") if isinstance(body.get("caseTheme"), str) else None},
        )
        return result
    except Exception as e:
        print(f"[Gemini Route] image/variant-one error: {e}")
        return JSONResponse({"error": str(e) or "Failed to generate portrait variant"}, status_code=500)


@router.post("/image/suspect-upload")
async def image_suspect_upload(request: Request):
    body = await request.json()
    try:
        result = await generate_suspect_from_upload(
            body.get("suspect"), body.get("userImageBase64"),
            body.get("caseId"), body.get("userId"),
        )
        return result
    except Exception as e:
        print(f"[Gemini Route] image/suspect-upload error: {e}")
        return JSONResponse({"error": str(e) or "Failed to process suspect upload"}, status_code=500)


@router.post("/image/regenerate")
async def image_regenerate(request: Request):
    body = await request.json()
    try:
        result = await regenerate_single_suspect(
            body.get("suspect"), body.get("caseId"),
            body.get("userId"), body.get("theme", "Noir"),
        )
        return result
    except Exception as e:
        print(f"[Gemini Route] image/regenerate error: {e}")
        return JSONResponse({"error": str(e) or "Failed to regenerate suspect"}, status_code=500)


@router.post("/image/regenerate-neutral")
async def image_regenerate_neutral(request: Request):
    body = await request.json()
    try:
        result = await generate_neutral_portrait_for_suspect(
            body.get("suspect"), body.get("caseId"),
            body.get("userId"), body.get("theme", "Noir"),
        )
        return result
    except Exception as e:
        print(f"[Gemini Route] image/regenerate-neutral error: {e}")
        return JSONResponse({"error": str(e) or "Failed to generate neutral portrait"}, status_code=500)


@router.post("/image/pregenerate")
async def image_pregenerate(request: Request):
    body = await request.json()
    case_data = body.get("caseData")
    user_id = body.get("userId")
    try:
        await pregenerate_case_images(case_data, user_id)
        # Return the mutated caseData (images are set directly on the object)
        return case_data
    except Exception as e:
        print(f"[Gemini Route] image/pregenerate error: {e}")
        return JSONResponse({"error": str(e) or "Failed to pregenerate case images"}, status_code=500)


@router.post("/image/create")
async def image_create(request: Request):
    body = await request.json()
    try:
        result = await create_image_from_prompt(body.get("userPrompt", ""), body.get("aspectRatio"))
        return {"base64": result}
    except Exception as e:
        print(f"[Gemini Route] image/create error: {e}")
        return JSONResponse({"error": str(e) or "Failed to create image"}, status_code=500)


@router.post("/image/edit")
async def image_edit(request: Request):
    body = await request.json()
    try:
        result = await edit_image_with_prompt(
            body.get("baseImageBase64", ""), body.get("userPrompt", ""),
            body.get("aspectRatio"),
        )
        return {"base64": result}
    except Exception as e:
        print(f"[Gemini Route] image/edit error: {e}")
        return JSONResponse({"error": str(e) or "Failed to edit image"}, status_code=500)


# --- TTS ENDPOINT ---

@router.post("/tts")
async def tts(request: Request):
    body = await request.json()
    try:
        base64_audio = await generate_tts(
            body.get("text", ""), body.get("voiceName", ""),
            body.get("stylePrompt"),
        )
        if base64_audio is None:
            return JSONResponse(
                {"error": "TTS is unavailable (skipped or not configured). Check voice selection and API key."},
                status_code=503,
            )
        return {"audio": base64_audio}
    except Exception as e:
        print(f"[Gemini Route] tts error: {e}")
        return JSONResponse({"error": str(e) or "Failed to generate TTS"}, status_code=500)
