"""
Image generation, emotional/forensic variants, evidence images, and case pregeneration.
Port of geminiImages.ts.
"""
from __future__ import annotations
import asyncio
import base64
import time
from typing import Any, Literal

import httpx
import firebase_admin
from firebase_admin import storage as fb_storage

from .gemini_client import ai
from .gemini_models import GEMINI_MODELS
from .gemini_styles import (
    STYLE_REF_URL,
    PIXEL_ART_BASE,
    INSTRUCTION_NEW_CHAR,
    INSTRUCTION_PRESERVE_CHAR,
    INSTRUCTION_EDIT_EMOTION_POSE,
    INSTRUCTION_EDIT_REFRAME,
    INSTRUCTION_RELATED_EVIDENCE,
    EVIDENCE_CARD_CLOSEUP_FRAMING,
    LIVING_CHARACTER_PORTRAIT_FRAMING,
    get_style_ref_base64,
)
from .victim_portrait_key import (
    infer_victim_portrait_key_for_evidence,
    environment_scene_portrait_key,
    ENV_SCENE_PORTRAIT_PREFIX,
)

# --- Emotion enum ---
class Emotion:
    NEUTRAL = "NEUTRAL"; ANGRY = "ANGRY"; SAD = "SAD"; NERVOUS = "NERVOUS"
    HAPPY = "HAPPY"; SURPRISED = "SURPRISED"; SLY = "SLY"; CONTENT = "CONTENT"
    DEFENSIVE = "DEFENSIVE"; ARROGANT = "ARROGANT"
    HEAD = "HEAD"; TORSO = "TORSO"; HANDS = "HANDS"; LEGS = "LEGS"
    ENVIRONMENT = "ENVIRONMENT"


ImageGenMode = Literal["create", "edit", "edit_reframe", "edit_emotion", "evidence"]

# --- Helpers ---

def _get_suspect_color_description(seed: int) -> str:
    descriptions = ["crimson", "emerald", "sapphire", "amber", "amethyst", "cyan", "slate", "sepia", "violet", "teal"]
    return descriptions[seed % len(descriptions)]


async def _upload_image(base64_data: str, path: str) -> str:
    if not base64_data or base64_data.startswith("http"):
        return base64_data
    try:
        data = base64_data.split(",")[1] if "," in base64_data else base64_data
        buffer = base64.b64decode(data)
        bucket = fb_storage.bucket()
        blob = bucket.blob(path)
        blob.upload_from_string(buffer, content_type="image/png")
        blob.cache_control = "public, max-age=3600"
        blob.patch()
        blob.make_public()
        return f"https://storage.googleapis.com/{bucket.name}/{path}?v={int(time.time() * 1000)}"
    except Exception as error:
        print(f"[Images] Upload failed for {path}: {error}")
        return base64_data


def _build_victim_prompt(s: dict, theme: str | None = None) -> str:
    details: list[str] = []
    if s.get("gender"):
        details.append(s["gender"])
    if s.get("role") and s["role"] != "The Victim":
        details.append(f"Role: {s['role']}")
    if s.get("bio"):
        details.append(f"Bio: {s['bio']}")
    if s.get("witnessObservations"):
        details.append(f"Scene details: {s['witnessObservations']}")
    physical_desc = s.get("physicalDescription", "")
    context_block = ". ".join(details) + "." if details else ""
    return f"""
    Subject: Crime scene depiction of a deceased victim. {context_block}
    {f'Theme: {theme}.' if theme else ''}
    Visual cues: {physical_desc or 'Use the character details above to determine appearance.'}.
    Condition: The victim is deceased.
    Composition: Scene should reflect the narrative context.
    NEGATIVE PROMPT: Smiling, lively, open eyes, looking at camera, text, UI, split screen.
    """


# --- IMAGE GENERATION HELPER ---

async def generate_image_raw(
    prompt: str,
    aspect_ratio: str = "1:1",
    ref_images: list[str] | None = None,
    mode: ImageGenMode = "create",
    model_override: str | None = None,
) -> str | None:
    """Generate an image and return raw base64 data."""
    ref_images = ref_images or []
    try:
        parts: list[dict[str, Any]] = []

        for ref in ref_images:
            base64_data = ""
            if ref == STYLE_REF_URL:
                fetched = await get_style_ref_base64()
                if fetched:
                    base64_data = fetched
            elif ref.startswith("data:"):
                base64_data = ref.split(",")[1]
            elif ref.startswith("http"):
                try:
                    async with httpx.AsyncClient(timeout=30) as client:
                        response = await client.get(ref)
                        response.raise_for_status()
                        base64_data = base64.b64encode(response.content).decode("ascii")
                except Exception:
                    raise RuntimeError(f"Failed to fetch reference image: {ref}")
            else:
                base64_data = ref

            if base64_data:
                parts.append({"inline_data": {"mime_type": "image/png", "data": base64_data}})
            else:
                raise RuntimeError(f"Reference image data missing for: {ref}")

        instruction = INSTRUCTION_NEW_CHAR
        if mode == "edit":
            instruction = INSTRUCTION_PRESERVE_CHAR
        elif mode == "edit_reframe":
            instruction = INSTRUCTION_EDIT_REFRAME
        elif mode == "edit_emotion":
            instruction = INSTRUCTION_EDIT_EMOTION_POSE
        elif mode == "evidence":
            instruction = INSTRUCTION_RELATED_EVIDENCE

        full_prompt = f"{PIXEL_ART_BASE} {instruction} {prompt}"
        parts.append({"text": full_prompt})

        res = await ai.aio.models.generate_content(
            model=model_override or GEMINI_MODELS["IMAGE"],
            contents={"parts": parts},
            config={"image_config": {"aspect_ratio": aspect_ratio}},
        )

        candidate = res.candidates[0] if res.candidates else None
        if candidate:
            finish_reason = str(getattr(candidate, "finish_reason", ""))
            if finish_reason == "SAFETY":
                ratings = getattr(candidate, "safety_ratings", []) or []
                blocked = [str(getattr(r, "category", "")).replace("HARM_CATEGORY_", "") for r in ratings if getattr(r, "blocked", False)]
                blocked_str = " ({})".format(", ".join(blocked)) if blocked else ""
                raise RuntimeError("Image blocked by safety filter{}.".format(blocked_str))
            if finish_reason == "RECITATION":
                raise RuntimeError("Image blocked: too similar to existing copyrighted content.")
            if finish_reason == "BLOCKLIST":
                raise RuntimeError("Image blocked: prompt contains restricted terms.")

        prompt_feedback = getattr(res, "prompt_feedback", None)
        if prompt_feedback:
            block_reason = getattr(prompt_feedback, "block_reason", None)
            if block_reason:
                raise RuntimeError(f"Prompt blocked by safety filter ({block_reason}).")

        if candidate and candidate.content and candidate.content.parts:
            for part in candidate.content.parts:
                inline_data = getattr(part, "inline_data", None)
                if inline_data and getattr(inline_data, "data", None):
                    raw = inline_data.data
                    # SDK may return bytes or str depending on version
                    if isinstance(raw, bytes):
                        return base64.b64encode(raw).decode("ascii")
                    return raw

        raise RuntimeError("No image was returned. This is usually caused by a safety filter.")
    except Exception as e:
        msg = str(e)
        status = getattr(e, "status", None) or getattr(e, "code", None)

        if status == 429 or "429" in msg or "RESOURCE_EXHAUSTED" in msg:
            raise RuntimeError("Rate limit exceeded — too many image requests. Wait a minute and try again.")
        if status in (401, 403) or "PERMISSION_DENIED" in msg:
            raise RuntimeError("Authentication error — API key may be invalid or expired.")
        if (isinstance(status, int) and status >= 500) or "INTERNAL" in msg or "UNAVAILABLE" in msg:
            raise RuntimeError("Google AI server error — the service is temporarily unavailable.")
        if any(msg.startswith(p) for p in ("Image blocked", "Prompt blocked", "No image was returned", "Rate limit", "Reference image")):
            raise
        print(f"Image Gen Failed: {e}")
        raise RuntimeError(f"Image generation failed: {msg}")


# --- Emotion directives ---

SUSPECT_EMOTION_DIRECTIVES: dict[str, str] = {
    "HAPPY": "Affect: positive valence, moderate arousal. Musculoskeletal: low tension; open, approachable configuration.",
    "ANGRY": "Affect: negative valence, high arousal. Musculoskeletal: high tension; confrontational or squared configuration.",
    "SAD": "Affect: negative valence, low energy. Musculoskeletal: elevated passive tension; collapsed or inward configuration.",
    "NERVOUS": "Affect: negative valence, high arousal. Musculoskeletal: protective or closed configuration; elevated tension in shoulders, jaw, and hands; weight may shift away from the viewer.",
    "SURPRISED": "Affect: high arousal, abrupt shift. Musculoskeletal: sudden retraction or elevation of upper body; widened facial aperture.",
    "SLY": "Affect: controlled positive/negative blend; low trust signaling. Musculoskeletal: asymmetric tension; guarded openness.",
    "CONTENT": "Affect: positive valence, low arousal. Musculoskeletal: low tension; stable, balanced configuration.",
    "DEFENSIVE": "Affect: negative valence, threat sensitivity. Musculoskeletal: closed or blocking configuration; elevated tension; orientation may shift away from the viewer.",
    "ARROGANT": "Affect: dominance signaling. Musculoskeletal: expanded vertical and frontal projection; controlled high tension.",
}


def _build_suspect_emotion_variant_prompt(emo: str, color_desc: str) -> str:
    key = emo.upper()
    directive = SUSPECT_EMOTION_DIRECTIVES.get(
        key,
        "Encode the label through congruent facial affect and upper-body posture; at least two independent channels (face, shoulders, arms, or stance) must change from neutral.",
    )
    return f"Emotional state: {key}. {directive} Keep solid {color_desc} background. Single portrait — one figure, one camera. {LIVING_CHARACTER_PORTRAIT_FRAMING} No text, no words."


# --- Deceased forensic prompts ---

DECEASED_FORENSIC_NEGATIVE = "MANDATORY IF VICTIM VISIBLE: eyes fully CLOSED, eyelids shut, lifeless; no pupils, no eye whites staring. FORBIDDEN: open eyes, wide eyes, staring upward, eye contact, alive or startled expression, standing, smiling, investigators, CSI techs, or living people as subjects. FORBIDDEN: text, UI."
DECEASED_SINGLE_CAMERA_RULE = "FORBIDDEN: multiple viewpoints, inset frames, overlaid regions at mismatched scale, split panels, or dual camera angles in one image. REQUIRED: one homogeneous output — single camera position and crop; subject matter fills the frame per the shot type."


def _build_deceased_forensic_edit_prompt(view: str, theme: str) -> str:
    prompts = {
        Emotion.HEAD: f"CAMERA: closer than reference; subject region head and face only; face occupies majority of frame height and width. Eyes CLOSED, lifeless. Forensic flash. Hair and skin tone consistent with reference. Pixel art. {DECEASED_SINGLE_CAMERA_RULE} {DECEASED_FORENSIC_NEGATIVE}",
        Emotion.TORSO: f"CAMERA: closer than reference; same scene identity. Subject region upper trunk and garments from reference; face excluded from frame by crop. FORBIDDEN: dual-scale composition where full-scene scale and detail scale both appear as distinct layers. {DECEASED_SINGLE_CAMERA_RULE} Forensic flash. Garment colors consistent with reference. Pixel art. {DECEASED_FORENSIC_NEGATIVE}",
        Emotion.HANDS: f"CAMERA: closer than reference. Primary subject: hands; hands occupy majority of frame; adjacent floor or fabric only as immediate context. No face. {DECEASED_SINGLE_CAMERA_RULE} Forensic flash. Skin and garment colors consistent with reference. Pixel art. {DECEASED_FORENSIC_NEGATIVE}",
        Emotion.LEGS: f"CAMERA: closer than reference. Primary subject: legs and footwear; lower limbs occupy majority of frame. No face. {DECEASED_SINGLE_CAMERA_RULE} Forensic flash. Garment colors consistent with reference. Pixel art. {DECEASED_FORENSIC_NEGATIVE}",
        Emotion.ENVIRONMENT: f"CAMERA: wide field of view relative to reference; must differ materially in distance, angle, or height. Room architecture and floor plane occupy majority of frame area; victim occupies small fractional area. FORBIDDEN: same viewpoint and field size as reference with only additive objects. Theme: {theme}. Forensic flash, pixel art. {DECEASED_SINGLE_CAMERA_RULE} {DECEASED_FORENSIC_NEGATIVE}",
    }
    return prompts.get(view, f"CAMERA: closer than reference; subject region upper trunk and garments; single coherent shot. {DECEASED_SINGLE_CAMERA_RULE} Forensic style. Pixel art. {DECEASED_FORENSIC_NEGATIVE}")


def _build_environment_scene_portrait_prompt(ev: dict, theme: str) -> str:
    loc = (ev.get("location") or "").strip()
    loc_bit = f"Placement / anchor (must match this in frame): {loc}. " if loc else ""
    include_body = ev.get("environmentIncludesBody") is True
    if include_body:
        return f'[ENVIRONMENT CLUE — PORTRAIT CARD] Camera must differ from the neutral full-body reference; FORBIDDEN: identical floor-centered body composition. {loc_bit}Primary evidence: "{ev.get("title", "")}" — {ev.get("description", "")}. Theme: {theme}. Victim only small, partial, or edge-blurred; if any face visible: eyes CLOSED, lifeless. Forensic flash, pixel art. {DECEASED_FORENSIC_NEGATIVE}'
    return f"""[ENVIRONMENT CLUE — PORTRAIT CARD — NO BODY IN FRAME] {loc_bit}Depict examination of the clue location — not a body examination and not a floor crime scene overview.

COMPOSITION: tight forensic shot; camera aimed into the placement surface or container. Evidence "{ev.get("title", "")}" is the dominant readable subject, consistent with: {ev.get("description", "")}. Camera angle: downward or oblique into the placement; evidence occupies majority of frame.

Use the reference image for room materials and wood tones only; reframe entirely away from the neutral body-centered layout. FORBIDDEN: victim, corpse, body, limbs, human face, investigators, police, magnifying glass over a person, or living people. No open eyes (no people at all). Forensic flash, pixel art. {DECEASED_FORENSIC_NEGATIVE}"""


def _build_victim_examination_image_prompt(view: str, theme: str, hidden_evidence: list[dict] | None = None) -> str:
    if view.startswith(ENV_SCENE_PORTRAIT_PREFIX):
        if hidden_evidence:
            ev = next((e for e in hidden_evidence if environment_scene_portrait_key(e.get("id", "")) == view), None)
            if ev:
                return _build_environment_scene_portrait_prompt(ev, theme)
    return _build_deceased_forensic_edit_prompt(view, theme)


# --- EMOTION GENERATION ---

async def _generate_emotional_variants(neutral_url: str, avatar_seed: int) -> dict[str, str]:
    new_portraits: dict[str, str] = {Emotion.NEUTRAL: neutral_url}
    color_desc = _get_suspect_color_description(avatar_seed)

    emotions = [Emotion.HAPPY, Emotion.ANGRY, Emotion.SAD, Emotion.NERVOUS, Emotion.SURPRISED, Emotion.SLY, Emotion.CONTENT, Emotion.DEFENSIVE, Emotion.ARROGANT]

    async def generate_variation(emo: str):
        prompt = _build_suspect_emotion_variant_prompt(emo, color_desc)
        raw = await generate_image_raw(prompt, "3:4", [neutral_url], "edit_emotion")
        return (emo, f"data:image/png;base64,{raw}") if raw else None

    BATCH_SIZE = 3
    for i in range(0, len(emotions), BATCH_SIZE):
        batch = emotions[i : i + BATCH_SIZE]
        results = await asyncio.gather(*(generate_variation(emo) for emo in batch))
        for r in results:
            if r:
                new_portraits[r[0]] = r[1]

    return new_portraits


# --- FORENSIC VARIANTS ---

async def _generate_forensic_variants(full_body_url: str, theme: str = "Noir", hidden_evidence: list[dict] | None = None) -> dict[str, str]:
    new_portraits: dict[str, str] = {Emotion.NEUTRAL: full_body_url}
    views: list[str] = [Emotion.HEAD, Emotion.TORSO, Emotion.HANDS, Emotion.LEGS, Emotion.ENVIRONMENT]
    for ev in (hidden_evidence or []):
        if ev.get("discoveryContext") == "environment":
            views.append(environment_scene_portrait_key(ev.get("id", "")))

    async def generate_view(view: str):
        prompt = _build_victim_examination_image_prompt(view, theme, hidden_evidence)
        raw = await generate_image_raw(prompt, "3:4", [full_body_url], "edit_reframe", GEMINI_MODELS["IMAGE_HD"])
        return (view, f"data:image/png;base64,{raw}") if raw else None

    BATCH_SIZE = 2
    for i in range(0, len(views), BATCH_SIZE):
        batch = views[i : i + BATCH_SIZE]
        results = await asyncio.gather(*(generate_view(v) for v in batch))
        for r in results:
            if r:
                new_portraits[r[0]] = r[1]

    return new_portraits


# --- PUBLIC IMAGE METHODS ---

async def ensure_victim_examination_portraits(suspect: dict, case_id: str, user_id: str, case_theme: str) -> int:
    if not user_id:
        raise RuntimeError("[CRITICAL] ensure_victim_examination_portraits: userId is required")
    if not suspect.get("isDeceased") or not suspect.get("hiddenEvidence"):
        return 0
    neutral = (suspect.get("portraits") or {}).get(Emotion.NEUTRAL)
    if not neutral or neutral == "PLACEHOLDER":
        return 0

    required: set[str] = set()
    for ev in suspect["hiddenEvidence"]:
        required.add(infer_victim_portrait_key_for_evidence(ev))

    portraits = suspect.setdefault("portraits", {})
    generated = 0
    for view in required:
        cur = portraits.get(view)
        if cur and cur != "PLACEHOLDER":
            continue
        prompt = _build_victim_examination_image_prompt(view, case_theme, suspect.get("hiddenEvidence"))
        raw = await generate_image_raw(prompt, "3:4", [neutral], "edit", GEMINI_MODELS["IMAGE_HD"])
        if not raw:
            print(f'[Images] Failed to generate missing victim portrait "{view}" for {suspect.get("name")}')
            continue
        b64 = f"data:image/png;base64,{raw}"
        portraits[view] = await _upload_image(b64, f"images/{user_id}/cases/{case_id}/suspects/{suspect['id']}/{view}.png")
        generated += 1
    return generated


async def generate_evidence_image(evidence: dict, case_id: str, user_id: str, ref_image: str | None = None, meta: dict | None = None) -> str:
    if not user_id:
        raise RuntimeError("[CRITICAL] generate_evidence_image: userId is required")
    style_refs: list[str] = [STYLE_REF_URL] if STYLE_REF_URL else []
    theme = (meta or {}).get("caseTheme", "Noir investigation")
    loc = (evidence.get("location") or "").strip()
    loc_bit = f" Placement: {loc}." if loc else ""

    refs = list(style_refs)
    ev_mode: Literal["create", "evidence"] = "create"
    prompt = ""
    for_deceased = (meta or {}).get("forDeceasedVictim", False)

    if for_deceased:
        zone = "environment" if evidence.get("discoveryContext") == "environment" else "body"
        if zone == "environment":
            include_body = evidence.get("environmentIncludesBody") is True
            if include_body and ref_image:
                refs = [*style_refs, ref_image]
                ev_mode = "evidence"
                prompt = f'{INSTRUCTION_RELATED_EVIDENCE} {EVIDENCE_CARD_CLOSEUP_FRAMING} {PIXEL_ART_BASE} Theme: {theme}. Evidence: "{evidence.get("title", "")}" — {evidence.get("description", "")}.{loc_bit} The physical evidence fills most of the frame. The victim from the reference may appear only as a small, partial, heavily blurred background hint — never the dominant subject. Harsh flash forensic mood. No text, no captions.'
            else:
                refs = list(style_refs)
                ev_mode = "create"
                prompt = f'{PIXEL_ART_BASE} {EVIDENCE_CARD_CLOSEUP_FRAMING} Theme: {theme}.{loc_bit} Evidence object: "{evidence.get("title", "")}" — {evidence.get("description", "")}. STRICT NEGATIVE: no dead body, no corpse, no human remains, no victim, no person, no limbs, no face in frame. Surrounding rug/floor/furniture only as soft peripheral context. Forensic flash. No text.'
        else:
            if ref_image:
                refs = [*style_refs, ref_image]
                ev_mode = "evidence"
                prompt = f'{INSTRUCTION_RELATED_EVIDENCE} {EVIDENCE_CARD_CLOSEUP_FRAMING} Close-up forensic detail on the body or clothing. "{evidence.get("title", "")}", {evidence.get("description", "")}.{loc_bit} {PIXEL_ART_BASE} Harsh flash, high contrast. No text.'
            else:
                refs = list(style_refs)
                ev_mode = "create"
                prompt = f'Subject: "{evidence.get("title", "")}", {evidence.get("description", "")}.{loc_bit} {EVIDENCE_CARD_CLOSEUP_FRAMING} Style: Forensic close-up on remains or garments. {PIXEL_ART_BASE} No text.'
    else:
        if ref_image:
            refs = [*style_refs, ref_image]
            ev_mode = "evidence"
            prompt = f'Subject: {evidence.get("title", "")}, {evidence.get("description", "")}.{loc_bit} {EVIDENCE_CARD_CLOSEUP_FRAMING} Style: Forensic evidence photo taken with a harsh flash. High contrast, strong shadows. Gritty crime scene aesthetic. {PIXEL_ART_BASE} No text.'
        elif evidence.get("discoveryContext") == "environment":
            refs = list(style_refs)
            ev_mode = "create"
            no_body = evidence.get("environmentIncludesBody") is not True
            prompt = f'{PIXEL_ART_BASE} {EVIDENCE_CARD_CLOSEUP_FRAMING} Theme: {theme}.{loc_bit} "{evidence.get("title", "")}" — {evidence.get("description", "")}. {"STRICT: no dead body, no corpse, no human remains in frame. " if no_body else ""}Forensic flash. No text.'
        else:
            refs = list(style_refs)
            ev_mode = "create"
            prompt = f'Subject: {evidence.get("title", "")}, {evidence.get("description", "")}.{loc_bit} {EVIDENCE_CARD_CLOSEUP_FRAMING} Style: Forensic evidence photo taken with a harsh flash. High contrast, strong shadows, illuminated center, dark vignette edges. Gritty crime scene aesthetic. {PIXEL_ART_BASE} No text.'

    b64 = await generate_image_raw(prompt, "1:1", refs, ev_mode)
    if not b64:
        return ""
    return await _upload_image(b64, f"images/{user_id}/cases/{case_id}/evidence/{evidence.get('id', 'unknown')}.png")


async def create_image_from_prompt(user_prompt: str, aspect_ratio: str = "3:4") -> str | None:
    refs = [STYLE_REF_URL] if STYLE_REF_URL else []
    raw = await generate_image_raw(user_prompt, aspect_ratio, refs, "create")
    return f"data:image/png;base64,{raw}" if raw else None


async def edit_image_with_prompt(base_image_base64: str, user_prompt: str, aspect_ratio: str = "3:4") -> str | None:
    prompt = f"[STRICT INSTRUCTION]: Edit the image provided. {user_prompt}. Maintain the pixel art style and composition. No text, no words."
    raw = await generate_image_raw(prompt, aspect_ratio, [base_image_base64], "edit")
    return f"data:image/png;base64,{raw}" if raw else None


async def generate_emotional_variants_from_base(
    neutral_base64: str, suspect: dict, case_id: str, user_id: str, opts: dict | None = None
) -> dict[str, str]:
    is_suspect_type = "isGuilty" in suspect
    is_deceased = is_suspect_type and suspect.get("isDeceased")
    theme = ((opts or {}).get("caseTheme") or "").strip() or "Noir"

    variant_portraits = (
        await _generate_forensic_variants(neutral_base64, theme, suspect.get("hiddenEvidence"))
        if is_deceased
        else await _generate_emotional_variants(neutral_base64, suspect.get("avatarSeed", 0))
    )

    folder = "suspects" if is_suspect_type else "support"
    uploaded: dict[str, str] = {
        Emotion.NEUTRAL: await _upload_image(neutral_base64, f"images/{user_id}/cases/{case_id}/{folder}/{suspect['id']}/neutral.png")
    }
    for emo, b64 in variant_portraits.items():
        if emo == Emotion.NEUTRAL:
            continue
        uploaded[emo] = await _upload_image(b64, f"images/{user_id}/cases/{case_id}/{folder}/{suspect['id']}/{emo}.png")
    return uploaded


async def generate_one_portrait_variant_from_base(
    neutral_base64: str, variant_key: str, suspect: dict, case_id: str, user_id: str, opts: dict | None = None
) -> dict:
    import re as _re
    if not user_id:
        raise RuntimeError("[CRITICAL] generate_one_portrait_variant_from_base: userId is required")
    is_suspect_type = "isGuilty" in suspect
    is_deceased = is_suspect_type and suspect.get("isDeceased")
    theme = ((opts or {}).get("caseTheme") or "").strip() or "Noir"
    folder = "suspects" if is_suspect_type else "support"
    file_key = _re.sub(r"[^a-zA-Z0-9._-]", "_", variant_key)

    if variant_key == Emotion.NEUTRAL:
        url = await _upload_image(neutral_base64, f"images/{user_id}/cases/{case_id}/{folder}/{suspect['id']}/neutral.png")
        return {"url": url}

    if not is_deceased:
        color_desc = _get_suspect_color_description(suspect.get("avatarSeed", 0))
        prompt = _build_suspect_emotion_variant_prompt(variant_key, color_desc)
        raw = await generate_image_raw(prompt, "3:4", [neutral_base64], "edit_emotion")
        if not raw:
            raise RuntimeError(f"Failed to generate portrait variant: {variant_key}")
        b64 = f"data:image/png;base64,{raw}"
        url = await _upload_image(b64, f"images/{user_id}/cases/{case_id}/{folder}/{suspect['id']}/{file_key}.png")
        return {"url": url}

    prompt = _build_victim_examination_image_prompt(variant_key, theme, suspect.get("hiddenEvidence"))
    raw = await generate_image_raw(prompt, "3:4", [neutral_base64], "edit_reframe", GEMINI_MODELS["IMAGE_HD"])
    if not raw:
        raise RuntimeError(f"Failed to generate forensic variant: {variant_key}")
    b64 = f"data:image/png;base64,{raw}"
    url = await _upload_image(b64, f"images/{user_id}/cases/{case_id}/{folder}/{suspect['id']}/{file_key}.png")
    return {"url": url}


async def generate_neutral_portrait_for_suspect(suspect: dict, case_id: str, user_id: str, theme: str = "Noir") -> dict:
    if not user_id:
        raise RuntimeError("[CRITICAL] generate_neutral_portrait_for_suspect: userId is required")
    color_desc = _get_suspect_color_description(suspect.get("avatarSeed", 0))
    is_suspect_type = "isGuilty" in suspect
    folder = "suspects" if is_suspect_type else "support"

    if is_suspect_type and suspect.get("isDeceased"):
        base_prompt = _build_victim_prompt(suspect, theme)
    else:
        base_prompt = f"""
        Subject: Portrait of a single {suspect.get('gender', '')} character. Role: {suspect.get('role', '')}.
        Theme: {theme}.
        Visual cues: {suspect.get('physicalDescription') or suspect.get('personality', '') or 'Detective style'}.
        Expression: Neutral.
        Background: Solid {color_desc} background.
        Composition: Front-facing mugshot, full-bleed to the left and right edges. {LIVING_CHARACTER_PORTRAIT_FRAMING}
        NEGATIVE PROMPT: Text, words, letters, UI, interface, signature, watermark, multiple people, photo-realistic.
        """

    refs = [STYLE_REF_URL] if STYLE_REF_URL else []
    neutral_raw = await generate_image_raw(base_prompt, "3:4", refs, "create", GEMINI_MODELS["IMAGE_HD"])
    if not neutral_raw:
        raise RuntimeError(f"Failed to generate base portrait for {suspect.get('name', '?')}")

    neutral_base64 = f"data:image/png;base64,{neutral_raw}"
    neutral_url = await _upload_image(neutral_base64, f"images/{user_id}/cases/{case_id}/{folder}/{suspect['id']}/neutral.png")
    return {"neutralUrl": neutral_url, "neutralBase64": neutral_base64}


async def regenerate_single_suspect(suspect: dict, case_id: str, user_id: str, theme: str = "Noir") -> dict:
    if not user_id:
        raise RuntimeError("[CRITICAL] regenerate_single_suspect: userId is required")
    print(f"[Gemini] regenerate_single_suspect: Starting for {suspect.get('name')} (Theme: {theme})")
    result = await generate_neutral_portrait_for_suspect(suspect, case_id, user_id, theme)
    neutral_url = result["neutralUrl"]
    neutral_base64 = result["neutralBase64"]
    is_suspect_type = "isGuilty" in suspect
    folder = "suspects" if is_suspect_type else "support"

    if is_suspect_type and suspect.get("isDeceased"):
        emotion_portraits = await _generate_forensic_variants(neutral_base64, theme, suspect.get("hiddenEvidence"))
    else:
        emotion_portraits = await _generate_emotional_variants(neutral_base64, suspect.get("avatarSeed", 0))

    uploaded: dict[str, str] = {Emotion.NEUTRAL: neutral_url}
    for emo, b64 in emotion_portraits.items():
        if emo == Emotion.NEUTRAL:
            continue
        uploaded[emo] = await _upload_image(b64, f"images/{user_id}/cases/{case_id}/{folder}/{suspect['id']}/{emo}.png")

    if is_suspect_type and suspect.get("isDeceased") and suspect.get("hiddenEvidence"):
        for ev in suspect["hiddenEvidence"]:
            try:
                ev_url = await generate_evidence_image(ev, case_id, user_id, neutral_base64, {"forDeceasedVictim": True, "caseTheme": theme})
                if ev_url:
                    ev["imageUrl"] = ev_url
            except Exception as e:
                print(f"Failed to regenerate hidden evidence {ev.get('id')} for victim: {e}")
                raise

    return {**suspect, "portraits": uploaded}


async def generate_suspect_from_upload(suspect: dict, user_image_base64: str, case_id: str, user_id: str) -> dict:
    if not user_id:
        raise RuntimeError("[CRITICAL] generate_suspect_from_upload: userId is required")
    print(f"[Gemini] generate_suspect_from_upload: Starting for {suspect.get('name')} (isDeceased: {suspect.get('isDeceased')})")
    color_desc = _get_suspect_color_description(suspect.get("avatarSeed", 0))

    if suspect.get("isDeceased"):
        victim_scene = _build_victim_prompt(suspect)
        conversion_prompt = f"""
        [TRANSFORM IMAGE]: Redraw the SECOND image as a 16-bit pixel art game asset.
        The FIRST image shows the target ART STYLE — copy its pixel art technique, NOT its subject or proportions.
        The SECOND image is the SUBJECT to transform.
        Output Style: {PIXEL_ART_BASE}
        Context: Redraw as a DECEASED VICTIM in a crime scene.
        {victim_scene}
        NEGATIVE PROMPT: portrait, mugshot, photorealistic, photography.
        """
    else:
        conversion_prompt = f"""
        [TRANSFORM IMAGE]: Redraw the SECOND image as a 16-bit pixel art game asset.
        The FIRST image shows the target ART STYLE — copy its pixel art technique, NOT its subject or proportions.
        The SECOND image is the SUBJECT to transform.
        POSE OVERRIDE: Standard MUGSHOT POSE facing DIRECTLY at the camera.
        Output Style: {PIXEL_ART_BASE}
        Background: Solid {color_desc} background.
        {LIVING_CHARACTER_PORTRAIT_FRAMING}
        NEGATIVE PROMPT: Photorealistic, photography, high resolution, smooth shading.
        """

    style_ref_b64 = None
    try:
        fetched = await get_style_ref_base64()
        if fetched:
            style_ref_b64 = fetched
    except Exception as e:
        print(f"Failed to get style ref for upload: {e}")

    parts: list[dict] = []
    if style_ref_b64:
        parts.append({"inline_data": {"mime_type": "image/png", "data": style_ref_b64}})
    img_data = user_image_base64.split(",")[1] if "," in user_image_base64 else user_image_base64
    parts.append({"inline_data": {"mime_type": "image/png", "data": img_data}})
    parts.append({"text": conversion_prompt})

    res = await ai.aio.models.generate_content(
        model=GEMINI_MODELS["IMAGE_HD"],
        contents={"parts": parts},
        config={"image_config": {"aspect_ratio": "3:4"}},
    )

    neutral_raw = None
    if res.candidates and res.candidates[0].content and res.candidates[0].content.parts:
        for part in res.candidates[0].content.parts:
            inline_data = getattr(part, "inline_data", None)
            if inline_data and getattr(inline_data, "data", None):
                neutral_raw = inline_data.data
                break

    if not neutral_raw:
        raise RuntimeError("Failed to convert uploaded image to pixel art.")

    neutral_base64 = f"data:image/png;base64,{neutral_raw}"
    neutral_url = await _upload_image(neutral_base64, f"images/{user_id}/cases/{case_id}/suspects/{suspect['id']}/neutral.png")

    variant_portraits = (
        await _generate_forensic_variants(neutral_base64, "Noir")
        if suspect.get("isDeceased")
        else await _generate_emotional_variants(neutral_base64, suspect.get("avatarSeed", 0))
    )

    uploaded: dict[str, str] = {Emotion.NEUTRAL: neutral_url}
    for emo, b64 in variant_portraits.items():
        if emo == Emotion.NEUTRAL:
            continue
        uploaded[emo] = await _upload_image(b64, f"images/{user_id}/cases/{case_id}/suspects/{suspect['id']}/{emo}.png")

    if suspect.get("isDeceased") and suspect.get("hiddenEvidence"):
        for ev in suspect["hiddenEvidence"]:
            try:
                ev_url = await generate_evidence_image(ev, case_id, user_id, neutral_base64, {"forDeceasedVictim": True, "caseTheme": "Noir"})
                if ev_url:
                    ev["imageUrl"] = ev_url
            except Exception as e:
                print(f"Failed to regenerate hidden evidence {ev.get('id')} for victim: {e}")

    return {**suspect, "portraits": uploaded}


async def pregenerate_case_images(case_data: dict, user_id: str) -> None:
    """Full case image pregeneration pipeline: neutrals → evidence → variants → hero."""
    if not user_id:
        raise RuntimeError("[CRITICAL] pregenerate_case_images: userId is required")
    style_refs = [STYLE_REF_URL] if STYLE_REF_URL else []

    # Phase 1: Neutrals
    neutral_map: dict[str, str] = {}
    base64_map: dict[str, str] = {}

    async def gen_suspect_neutral(s: dict):
        color_desc = _get_suspect_color_description(s.get("avatarSeed", 0))
        if s.get("isDeceased"):
            prompt = _build_victim_prompt(s, case_data.get("type"))
        else:
            prompt = f"""
            Subject: Portrait of a single {s.get('gender', '')} character. Role: {s.get('role', '')}.
            Visual cues: {s.get('physicalDescription', '') or 'Noir style'}.
            Expression: Neutral.
            Background: Solid {color_desc} background.
            Composition: Front-facing mugshot, full-bleed. {LIVING_CHARACTER_PORTRAIT_FRAMING}
            NEGATIVE PROMPT: Text, UI, border, letters, photo-realistic.
            """
        b64 = await generate_image_raw(prompt, "3:4", style_refs, "create", GEMINI_MODELS["IMAGE_HD"])
        if b64:
            url = await _upload_image(b64, f"images/{user_id}/cases/{case_data['id']}/suspects/{s['id']}/neutral.png")
            neutral_map[s["id"]] = url
            base64_map[s["id"]] = f"data:image/png;base64,{b64}"
            s.setdefault("portraits", {})[Emotion.NEUTRAL] = url

    async def gen_partner_neutral():
        p = case_data.get("partner")
        if not p:
            return
        prompt = f"Subject: Portrait of a {p.get('gender', '')} {p.get('role', '')} named {p.get('name', '')}. Theme: {case_data.get('type', '')}. Expression: Eager, helpful. Background: City street or tech lab. Composition: Front-facing mugshot, full-bleed. {LIVING_CHARACTER_PORTRAIT_FRAMING} {PIXEL_ART_BASE}"
        b64 = await generate_image_raw(prompt, "3:4", style_refs, "create", GEMINI_MODELS["IMAGE_HD"])
        if b64:
            url = await _upload_image(b64, f"images/{user_id}/cases/{case_data['id']}/partner/neutral.png")
            neutral_map["partner"] = url
            base64_map["partner"] = f"data:image/png;base64,{b64}"
            p.setdefault("portraits", {})[Emotion.NEUTRAL] = url

    async def gen_officer_neutral():
        o = case_data.get("officer")
        if not o:
            return
        prompt = f"Subject: Portrait of a {o.get('gender', '')} {o.get('role', '')} named {o.get('name', '')}. Theme: {case_data.get('type', '')}. Expression: Stern, commanding. Background: Office or Command Center. Composition: Front-facing mugshot, full-bleed. {LIVING_CHARACTER_PORTRAIT_FRAMING} {PIXEL_ART_BASE}"
        b64 = await generate_image_raw(prompt, "3:4", style_refs, "create", GEMINI_MODELS["IMAGE_HD"])
        if b64:
            url = await _upload_image(b64, f"images/{user_id}/cases/{case_data['id']}/officer.png")
            o.setdefault("portraits", {})[Emotion.NEUTRAL] = url

    tasks = [gen_suspect_neutral(s) for s in case_data.get("suspects", [])]
    tasks.append(gen_partner_neutral())
    tasks.append(gen_officer_neutral())
    await asyncio.gather(*tasks)

    # Phase 2: Evidence
    ev_tasks = []
    for ev in case_data.get("initialEvidence", []):
        async def gen_initial_ev(e=ev):
            try:
                url = await generate_evidence_image(e, case_data["id"], user_id, None, {"caseTheme": case_data.get("type")})
                if url:
                    e["imageUrl"] = url
            except Exception as err:
                print(f"[pregenerate] initial evidence {e.get('id')}: {err}")
        ev_tasks.append(gen_initial_ev())

    for s in case_data.get("suspects", []):
        suspect_ref = base64_map.get(s["id"])
        for ev in s.get("hiddenEvidence", []):
            async def gen_hidden_ev(e=ev, _s=s, _ref=suspect_ref):
                try:
                    url = await generate_evidence_image(
                        e, case_data["id"], user_id,
                        _ref if _s.get("isDeceased") else None,
                        {"forDeceasedVictim": True, "caseTheme": case_data.get("type")} if _s.get("isDeceased") else None,
                    )
                    if url:
                        e["imageUrl"] = url
                except Exception as err:
                    print(f"[pregenerate] hidden evidence {e.get('id')}: {err}")
            ev_tasks.append(gen_hidden_ev())
    await asyncio.gather(*ev_tasks)

    # Phase 3: Emotional / Forensic Variants
    living_emotions = [Emotion.HAPPY, Emotion.ANGRY, Emotion.SAD, Emotion.NERVOUS, Emotion.SURPRISED, Emotion.SLY, Emotion.CONTENT, Emotion.DEFENSIVE, Emotion.ARROGANT]
    forensic_views = [Emotion.HEAD, Emotion.TORSO, Emotion.HANDS, Emotion.LEGS, Emotion.ENVIRONMENT]

    variant_tasks_data = []
    for s in case_data.get("suspects", []):
        b64 = base64_map.get(s["id"])
        if not b64:
            continue
        if s.get("isDeceased"):
            for v in forensic_views:
                variant_tasks_data.append({"targetId": s["id"], "emotion": v, "neutralUrl": b64, "type": "suspect"})
            for ev in s.get("hiddenEvidence", []):
                if ev.get("discoveryContext") == "environment":
                    variant_tasks_data.append({"targetId": s["id"], "emotion": environment_scene_portrait_key(ev["id"]), "neutralUrl": b64, "type": "suspect"})
        else:
            for emo in living_emotions:
                variant_tasks_data.append({"targetId": s["id"], "emotion": emo, "neutralUrl": b64, "type": "suspect"})

    if case_data.get("partner") and base64_map.get("partner"):
        for emo in living_emotions:
            variant_tasks_data.append({"targetId": "partner", "emotion": emo, "neutralUrl": base64_map["partner"], "type": "partner"})

    BATCH_SIZE = 4
    for i in range(0, len(variant_tasks_data), BATCH_SIZE):
        batch = variant_tasks_data[i : i + BATCH_SIZE]

        async def process_variant(task: dict):
            s = next((x for x in case_data.get("suspects", []) if x["id"] == task["targetId"]), None)
            is_deceased = s.get("isDeceased") if s else False
            color_desc = _get_suspect_color_description(s.get("avatarSeed", 0)) if s else "dark grey"
            if task["type"] == "partner":
                color_desc = "city street or tech lab"

            variant_mode: ImageGenMode = "edit_reframe" if is_deceased else "edit_emotion"
            if is_deceased:
                prompt = _build_victim_examination_image_prompt(task["emotion"], case_data.get("type", "Noir"), s.get("hiddenEvidence") if s else None)
            else:
                prompt = _build_suspect_emotion_variant_prompt(task["emotion"], color_desc)

            b64 = await generate_image_raw(prompt, "3:4", [task["neutralUrl"]], variant_mode, GEMINI_MODELS["IMAGE_HD"])
            if b64:
                folder = "suspects" if task["type"] == "suspect" else "partner"
                url = await _upload_image(b64, f"images/{user_id}/cases/{case_data['id']}/{folder}/{task['targetId']}/{task['emotion']}.png")
                if task["type"] == "suspect" and s and s.get("portraits") is not None:
                    s["portraits"][task["emotion"]] = url
                elif task["type"] == "partner" and case_data.get("partner") and case_data["partner"].get("portraits") is not None:
                    case_data["partner"]["portraits"][task["emotion"]] = url

        await asyncio.gather(*(process_variant(t) for t in batch))

    # Phase 4: Hero Image
    victim = next((s for s in case_data.get("suspects", []) if s.get("isDeceased")), None)
    if victim and victim.get("portraits", {}).get(Emotion.NEUTRAL):
        case_data["heroImageUrl"] = victim["portraits"][Emotion.NEUTRAL]
    elif case_data.get("initialEvidence") and case_data["initialEvidence"][0].get("imageUrl"):
        case_data["heroImageUrl"] = case_data["initialEvidence"][0]["imageUrl"]
