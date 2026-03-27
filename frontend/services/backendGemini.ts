/**
 * Frontend API client for Gemini backend endpoints.
 * All Gemini operations are proxied through the backend, which holds the API key.
 * Authentication uses Firebase ID tokens (same pattern as other backend calls).
 */
import toast from './appToast';
import { auth } from './firebase';
import { API_BASE } from './apiBase';
import { getHttpErrorMessage } from '../utils/httpErrorMessages';

/** Same id as App.tsx Gemini catch blocks so we don't stack duplicate toasts. */
export const GEMINI_API_ERROR_TOAST_ID = 'gemini-api-error';

/** Gemini/backend API failures — uses appToast stack (bottom, under CRT bezel). */
export function showGeminiApiErrorToast(message: string): void {
  const text = message.trim() || 'Request failed. Please try again.';
  toast.error(text, { id: GEMINI_API_ERROR_TOAST_ID, duration: 6500 });
}

function extractErrorString(errorData: unknown, status: number): string {
  if (!errorData || typeof errorData !== 'object') {
    return `Backend request failed: ${status}`;
  }
  const err = (errorData as { error?: unknown }).error;
  if (typeof err === 'string' && err.trim()) return err;
  if (err && typeof err === 'object' && err !== null && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m;
  }
  return `Backend request failed: ${status}`;
}

/**
 * Makes an authenticated POST request to a Gemini backend endpoint.
 * @param path - Endpoint path (e.g. '/chat/suspect')
 * @param body - Request body (will be JSON-serialized)
 * @returns Parsed JSON response
 */
function geminiErrorContext(path: string): { geminiBackend: true; geminiTts: boolean } {
  const isTts = path === '/tts' || path.startsWith('/tts/');
  return { geminiBackend: true, geminiTts: isTts };
}

export const geminiPost = async <T = any>(path: string, body: any): Promise<T> => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated. Please sign in first.');

  const token = await user.getIdToken();
  const errCtx = geminiErrorContext(path);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/gemini${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Network error';
    const message =
      getHttpErrorMessage(0, msg, errCtx).trim() || 'Network error. Please try again.';
    showGeminiApiErrorToast(message);
    throw new Error(message);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const fallback = extractErrorString(errorData, response.status);
    const message =
      getHttpErrorMessage(response.status, fallback, errCtx).trim() ||
      'Request failed. Please try again.';
    showGeminiApiErrorToast(message);
    throw new Error(message);
  }

  try {
    return await response.json();
  } catch {
    const message = 'Could not read server response (invalid JSON).';
    showGeminiApiErrorToast(message);
    throw new Error(message);
  }
};
