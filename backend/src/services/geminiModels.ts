/**
 * Centralized Gemini model IDs and chat fallback behavior.
 * Change strings here to switch models across the backend.
 */
export const GEMINI_MODELS = {
  CASE_ENGINE: "gemini-3.1-flash-lite-preview",
  CASE_GENERATION: "gemini-3.1-pro-preview",
  CHAT: "gemini-3.1-flash-lite-preview",
  IMAGE: "gemini-2.5-flash-image",
  IMAGE_HD: "gemini-3.1-flash-image-preview",
  TTS: "gemini-2.5-flash-preview-tts",
} as const;

/**
 * Suspect chat: try in order when a model returns overload / unavailable (e.g. 503).
 * Note: There is no `gemini-3.1-flash-preview` for text — the 3.1 Flash line is Flash-Lite per API docs.
 */
export const CHAT_SUSPECT_MODEL_PRIORITY = [
  "gemini-3.1-flash-lite-preview",
  "gemini-3-flash-preview",
] as const;

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
