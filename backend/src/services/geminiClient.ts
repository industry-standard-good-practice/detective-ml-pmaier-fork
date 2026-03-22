import { GoogleGenAI } from "@google/genai";

// --- Gemini SDK Initialization ---
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('[Gemini] WARNING: GEMINI_API_KEY is not set. Gemini endpoints will fail.');
}

export const ai = new GoogleGenAI({ apiKey: apiKey || '' });

/**
 * Centralized Gemini Model Configuration
 * Change the model strings here to switch models across the entire app.
 */
export const GEMINI_MODELS = {
  CASE_ENGINE: "gemini-3.1-flash-lite-preview",
  CASE_GENERATION: "gemini-3.1-pro-preview",
  CHAT: "gemini-3.1-flash-lite-preview",
  IMAGE: "gemini-2.5-flash-image",
  IMAGE_HD: "gemini-3.1-flash-image-preview",
  TTS: "gemini-2.5-flash-preview-tts",
} as const;
