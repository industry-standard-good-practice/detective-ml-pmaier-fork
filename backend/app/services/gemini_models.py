"""
Centralized Gemini model IDs and overload fallback for shared text primaries.
Change strings here to switch models across the backend.
"""
from __future__ import annotations
import re
from typing import Awaitable, Callable, TypeVar

T = TypeVar("T")

GEMINI_FLASH_LITE_TEXT_PRIMARY = "gemini-3.1-flash-lite-preview"

GEMINI_MODELS = {
    "CASE_ENGINE": GEMINI_FLASH_LITE_TEXT_PRIMARY,
    "CASE_GENERATION": "gemini-3.1-pro-preview",
    "CHAT": GEMINI_FLASH_LITE_TEXT_PRIMARY,
    "IMAGE": "gemini-2.5-flash-image",
    "IMAGE_HD": "gemini-3.1-flash-image-preview",
    "TTS": "gemini-2.5-flash-preview-tts",
}

FLASH_LITE_TEXT_MODEL_FALLBACK = [
    GEMINI_FLASH_LITE_TEXT_PRIMARY,
    "gemini-3-flash-preview",
]


def is_retryable_chat_model_overload_error(err: BaseException) -> bool:
    msg = str(err)
    if re.search(r"503|UNAVAILABLE|high demand|overloaded|Resource exhausted", msg, re.IGNORECASE):
        return True
    code = getattr(err, "code", None) or getattr(err, "status", None)
    if code == 503:
        return True
    nested = getattr(err, "error", None)
    if nested:
        if getattr(nested, "code", None) == 503:
            return True
        if str(getattr(nested, "status", "")).upper() == "UNAVAILABLE":
            return True
    return False


async def generate_with_text_model(
    primary_model: str,
    try_generate: Callable[[str], Awaitable[T]],
    log_context: str,
) -> T:
    """
    Run a generateContent (or equivalent) using primary_model, or the Flash-Lite fallback chain
    when primary_model is GEMINI_FLASH_LITE_TEXT_PRIMARY.
    """
    if primary_model != GEMINI_FLASH_LITE_TEXT_PRIMARY:
        return await try_generate(primary_model)

    last_err: BaseException | None = None
    chain = FLASH_LITE_TEXT_MODEL_FALLBACK
    for i, model in enumerate(chain):
        try:
            result = await try_generate(model)
            if i > 0:
                print(f"[Gemini] {log_context}: succeeded with fallback model {model}")
            return result
        except Exception as err:
            last_err = err
            has_fallback = i < len(chain) - 1
            if not has_fallback or not is_retryable_chat_model_overload_error(err):
                raise
            snippet = str(err)[:200]
            print(
                f"[Gemini] {log_context}: model {model} unavailable; retrying with {chain[i + 1]}. {snippet}"
            )

    raise last_err or RuntimeError(f"{log_context}: no model response")
