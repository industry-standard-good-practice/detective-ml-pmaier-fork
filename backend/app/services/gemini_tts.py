"""
TTS generation via Gemini.
"""
from __future__ import annotations
import base64
import os
from google.genai import Client as GoogleGenAI


async def generate_tts(text: str, voice_name: str, style_prompt: str | None = None) -> str | None:
    """
    Generates TTS audio and returns the raw base64-encoded audio data.
    The frontend is responsible for constructing the WAV and registering with AudioContext.
    """
    if not voice_name or voice_name == "None" or not os.environ.get("GEMINI_API_KEY"):
        if voice_name == "None":
            print("[TTS] Skipped: Voice set to None")
        return None

    try:
        # Build content: if we have a style prompt, prepend it as director's notes
        if style_prompt:
            content_text = f"{style_prompt}\n\n#### TRANSCRIPT\n{text}"
        else:
            content_text = text

        from .gemini_models import GEMINI_MODELS

        ai = GoogleGenAI(api_key=os.environ.get("GEMINI_API_KEY", ""))
        response = await ai.aio.models.generate_content(
            model=GEMINI_MODELS["TTS"],
            contents=[{"parts": [{"text": content_text}]}],
            config={
                "response_modalities": ["AUDIO"],
                "speech_config": {
                    "voice_config": {
                        "prebuilt_voice_config": {"voice_name": voice_name},
                    },
                },
            },
        )

        candidates = getattr(response, "candidates", None) or []
        if candidates:
            parts = getattr(candidates[0].content, "parts", None) or []
            if parts:
                inline_data = getattr(parts[0], "inline_data", None)
                if inline_data and getattr(inline_data, "data", None):
                    raw = inline_data.data
                    # Ensure we return a base64 string, not raw bytes
                    if isinstance(raw, bytes):
                        return base64.b64encode(raw).decode("ascii")
                    return raw

        raise RuntimeError(
            "Gemini text-to-speech returned no audio (empty response). "
            "Often a rate or quota limit—wait and retry, or turn off TTS."
        )
    except Exception as error:
        print(f"[TTS] Generation Error: {error}")
        raise
