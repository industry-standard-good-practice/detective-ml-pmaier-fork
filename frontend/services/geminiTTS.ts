/**
 * Frontend geminiTTS.ts — refactored to delegate TTS generation to the backend.
 * WAV construction and AudioContext registration remain client-side.
 */
import { geminiPost } from './backendGemini';

// --- AudioContext PCM registration (client-side only) ---
let audioCtx: AudioContext | null = null;
const audioMap = new Map<string, AudioBuffer>();

const getAudioCtx = () => {
  if (!audioCtx) audioCtx = new AudioContext({ sampleRate: 24000 });
  return audioCtx;
};

/**
 * Registers raw PCM data into the audio map for later playback.
 * This is called with the base64 PCM data returned from the backend.
 */
const registerPcmData = (base64: string, id: string): string => {
  const ctx = getAudioCtx();
  const pcm = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

  // Create WAV header for 16-bit mono PCM at 24kHz
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 24000, true);
  view.setUint32(28, 48000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, pcm.length, true);

  const wav = new Uint8Array(wavHeader.byteLength + pcm.length);
  wav.set(new Uint8Array(wavHeader), 0);
  wav.set(pcm, 44);

  const blob = new Blob([wav], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);

  // Decode in the background for potential reuse
  ctx.decodeAudioData(wav.buffer.slice(0)).then(buf => audioMap.set(id, buf)).catch(() => {});

  return url;
};

/**
 * Generates TTS audio for the given text and voice.
 * The backend generates the raw PCM base64; here we construct the WAV and register it.
 */
export const generateTTS = async (text: string, voiceName: string): Promise<string | null> => {
  if (!voiceName || voiceName === 'None') {
    if (voiceName === 'None') console.log("[TTS] Skipped: Voice set to None");
    return null;
  }

  try {
    const result = await geminiPost<{ audio: string | null }>('/tts', { text, voiceName });
    
    if (result.audio) {
      const id = `tts-${Date.now()}`;
      return registerPcmData(result.audio, id);
    }
    return null;
  } catch (error) {
    console.error("[TTS] Generation Error:", error);
    return null;
  }
};
