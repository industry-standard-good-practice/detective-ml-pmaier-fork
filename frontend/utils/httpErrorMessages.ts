/**
 * User-facing copy for common API failures.
 * The backend often maps Gemini 429/503 to HTTP 500 with the provider message in the body,
 * so we also infer rate limits from error text.
 */
export type HttpErrorMessageContext = {
  /** Request went to our Gemini proxy (`/api/gemini/*`). */
  geminiBackend?: boolean;
  /** That request was text-to-speech (`/tts`). */
  geminiTts?: boolean;
};

const MSG_GEMINI_TTS_RATE =
  'Google Gemini text-to-speech hit a rate or quota limit. Wait briefly and retry, or disable voice/TTS in settings.';
const MSG_GEMINI_API_RATE =
  'Google Gemini API rate or quota limit. Wait a moment and try again.';
const MSG_GENERIC_RATE = 'Too many requests. Please wait a moment and try again.';

const MSG_GEMINI_TTS_503 =
  'Google Gemini text-to-speech is temporarily unavailable. Try again in a moment.';
const MSG_GEMINI_503 = 'Google Gemini is temporarily unavailable. Try again in a moment.';
const MSG_GENERIC_503 = 'Service is temporarily unavailable. Please try again in a moment.';

export function isLikelyRateLimitFromText(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const m = text.toLowerCase();
  if (/\b429\b/.test(text)) return true;
  if (m.includes('resource_exhausted') || m.includes('resource exhausted')) return true;
  if (m.includes('too many requests')) return true;
  if (m.includes('quota') && (m.includes('exceeded') || m.includes('exceed'))) return true;
  if (m.includes('rate limit') || m.includes('rate-limit')) return true;
  return false;
}

export function getHttpErrorMessage(
  status: number,
  serverOrFallback: string,
  ctx?: HttpErrorMessageContext
): string {
  const gemini = ctx?.geminiBackend || ctx?.geminiTts;
  const tts = ctx?.geminiTts;

  if (status === 429) {
    if (tts) return MSG_GEMINI_TTS_RATE;
    if (gemini) return MSG_GEMINI_API_RATE;
    return MSG_GENERIC_RATE;
  }
  if (status === 503) {
    if (tts) return MSG_GEMINI_TTS_503;
    if (gemini) return MSG_GEMINI_503;
    return MSG_GENERIC_503;
  }
  if (isLikelyRateLimitFromText(serverOrFallback)) {
    if (tts) return MSG_GEMINI_TTS_RATE;
    if (gemini) return MSG_GEMINI_API_RATE;
    return MSG_GENERIC_RATE;
  }
  return serverOrFallback;
}
