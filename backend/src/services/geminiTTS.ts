import { GoogleGenAI, Modality } from "@google/genai";
import { GEMINI_MODELS } from "./geminiClient.js";

/**
 * Generates TTS audio and returns the raw base64-encoded audio data.
 * The frontend is responsible for constructing the WAV and registering with AudioContext.
 */
export const generateTTS = async (text: string, voiceName: string): Promise<string | null> => {
  if (!voiceName || voiceName === 'None' || !process.env.GEMINI_API_KEY) {
    if (voiceName === 'None') console.log("[TTS] Skipped: Voice set to None");
    return null;
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: GEMINI_MODELS.TTS,
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      return base64Audio; // Return raw PCM base64 — frontend builds WAV
    }
    return null;
  } catch (error) {
    console.error("[TTS] Generation Error:", error);
    return null;
  }
};
