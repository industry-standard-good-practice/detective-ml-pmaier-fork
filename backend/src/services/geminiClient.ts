import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("[Gemini] WARNING: GEMINI_API_KEY is not set. Gemini endpoints will fail.");
}

export const ai = new GoogleGenAI({ apiKey: apiKey || "" });
