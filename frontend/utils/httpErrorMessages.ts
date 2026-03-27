/**
 * User-facing copy for common API failures.
 * The backend often maps Gemini 429/503 to HTTP 500 with the provider message in the body,
 * so we also infer rate limits from error text.
 */
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

export function getHttpErrorMessage(status: number, serverOrFallback: string): string {
  if (status === 429) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  if (status === 503) {
    return 'Service is temporarily unavailable. Please try again in a moment.';
  }
  if (isLikelyRateLimitFromText(serverOrFallback)) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  return serverOrFallback;
}
