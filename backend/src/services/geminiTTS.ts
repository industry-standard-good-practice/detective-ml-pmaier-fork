import { GoogleGenAI, Modality } from "@google/genai";
import { GEMINI_MODELS } from "./geminiModels.js";

/**
 * Generates TTS audio and returns the raw base64-encoded audio data.
 * The frontend is responsible for constructing the WAV and registering with AudioContext.
 *
 * @param text - The dialogue text to speak
 * @param voiceName - The Gemini TTS voice name (e.g. "Kore", "Charon")
 * @param stylePrompt - Optional style/persona prompt that controls tone, accent, pacing, and emotion.
 *                       Uses the Gemini TTS "style control" feature via natural language prompts.
 */
export const generateTTS = async (text: string, voiceName: string, stylePrompt?: string): Promise<string | null> => {
  if (!voiceName || voiceName === 'None' || !process.env.GEMINI_API_KEY) {
    if (voiceName === 'None') console.log("[TTS] Skipped: Voice set to None");
    return null;
  }

  try {
    // Build the content: if we have a style prompt, prepend it as director's notes
    // followed by the transcript. The TTS model uses this to control delivery.
    let contentText: string;
    if (stylePrompt) {
      contentText = `${stylePrompt}\n\n#### TRANSCRIPT\n${text}`;
    } else {
      contentText = text;
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: GEMINI_MODELS.TTS,
      contents: [{ parts: [{ text: contentText }] }],
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
    throw new Error(
      "Gemini text-to-speech returned no audio (empty response). Often a rate or quota limit—wait and retry, or turn off TTS."
    );
  } catch (error) {
    console.error("[TTS] Generation Error:", error);
    if (error instanceof Error) throw error;
    throw new Error(String(error));
  }
};
