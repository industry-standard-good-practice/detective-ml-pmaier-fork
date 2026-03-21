/**
 * Frontend API client for Gemini backend endpoints.
 * All Gemini operations are proxied through the backend, which holds the API key.
 * Authentication uses Firebase ID tokens (same pattern as other backend calls).
 */
import { auth } from './firebase';
import { API_BASE } from './apiBase';

/**
 * Makes an authenticated POST request to a Gemini backend endpoint.
 * @param path - Endpoint path (e.g. '/chat/suspect')
 * @param body - Request body (will be JSON-serialized)
 * @returns Parsed JSON response
 */
export const geminiPost = async <T = any>(path: string, body: any): Promise<T> => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated. Please sign in first.');

  const token = await user.getIdToken();

  const response = await fetch(`${API_BASE}/api/gemini${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.error || `Backend request failed: ${response.status}`;
    throw new Error(message);
  }

  return response.json();
};
