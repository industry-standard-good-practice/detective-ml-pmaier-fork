/**
 * Centralized Gemini model IDs and overload fallback for shared text primaries.
 * Change strings here to switch models across the backend.
 */
export const GEMINI_FLASH_LITE_TEXT_PRIMARY = "gemini-3.1-flash-lite-preview" as const;

export const GEMINI_MODELS = {
  CASE_ENGINE: GEMINI_FLASH_LITE_TEXT_PRIMARY,
  CASE_GENERATION: "gemini-3.1-pro-preview",
  CHAT: GEMINI_FLASH_LITE_TEXT_PRIMARY,
  IMAGE: "gemini-2.5-flash-image",
  IMAGE_HD: "gemini-3.1-flash-image-preview",
  TTS: "gemini-2.5-flash-preview-tts",
} as const;

/**
 * Any call whose configured primary is {@link GEMINI_FLASH_LITE_TEXT_PRIMARY} (case engine, chat, etc.)
 * tries these in order when the API returns overload / unavailable (e.g. 503).
 */
export const FLASH_LITE_TEXT_MODEL_FALLBACK = [
  GEMINI_FLASH_LITE_TEXT_PRIMARY,
  "gemini-3-flash-preview",
] as const;

/**
 * Run a generateContent (or equivalent) using `primaryModel`, or the Flash-Lite fallback chain
 * when `primaryModel` is {@link GEMINI_FLASH_LITE_TEXT_PRIMARY}.
 */
export async function generateWithTextModel<T>(
  primaryModel: string,
  tryGenerate: (modelId: string) => Promise<T>,
  logContext: string
): Promise<T> {
  if (primaryModel !== GEMINI_FLASH_LITE_TEXT_PRIMARY) {
    return tryGenerate(primaryModel);
  }
  let lastErr: unknown;
  const chain = FLASH_LITE_TEXT_MODEL_FALLBACK;
  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    try {
      const result = await tryGenerate(model);
      if (i > 0) {
        console.warn(`[Gemini] ${logContext}: succeeded with fallback model ${model}`);
      }
      return result;
    } catch (err) {
      lastErr = err;
      const hasFallback = i < chain.length - 1;
      if (!hasFallback || !isRetryableChatModelOverloadError(err)) {
        throw err;
      }
      const snippet = String((err as Error).message ?? err);
      console.warn(
        `[Gemini] ${logContext}: model ${model} unavailable; retrying with ${chain[i + 1]}. ${snippet.slice(0, 200)}`
      );
    }
  }
  throw lastErr ?? new Error(`${logContext}: no model response`);
}

export function isRetryableChatModelOverloadError(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  const msg = String(e.message ?? "");
  if (/503|UNAVAILABLE|high demand|overloaded|Resource exhausted/i.test(msg)) return true;
  const nested = e.error as Record<string, unknown> | undefined;
  if (nested && Number(nested.code) === 503) return true;
  if (nested && String(nested.status).toUpperCase() === "UNAVAILABLE") return true;
  if (Number(e.status) === 503) return true;
  return false;
}
