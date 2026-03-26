/**
 * iOS Safari-compatible audio player.
 * 
 * iOS Safari has the strictest audio policy of any browser:
 * - AudioContext.start() / Audio.play() MUST be called inside a user gesture
 * - Once you call play() on an Audio element inside a gesture, that element
 *   is "unlocked" and can be reused for subsequent plays without gestures
 * - Blob URLs don't work reliably for audio on Safari/WebKit
 * 
 * Strategy:
 * 1. On first user tap, create + play a silent Audio element to "unlock" it
 * 2. Cache raw PCM data from TTS generation (avoids blob URL issues)
 * 3. To play: convert PCM → WAV data URL, set src on unlocked element, play()
 */

// ---- Raw PCM Cache ----
interface PcmEntry {
  pcmData: Int16Array;
  sampleRate: number;
}
const pcmCache = new Map<string, PcmEntry>();

export function registerPcmData(blobUrl: string, pcmInt16: Int16Array, sampleRate: number): void {
  pcmCache.set(blobUrl, { pcmData: pcmInt16, sampleRate });
}

// ---- Warm Audio Element (iOS Safari unlock trick) ----
let warmAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;

// Tiny silent WAV as data URL (44 bytes header + 2 bytes of silence)
const SILENT_WAV = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA==';

function unlockAudio(): void {
  if (audioUnlocked) return;
  
  try {
    if (!warmAudio) {
      warmAudio = new Audio();
      warmAudio.setAttribute('playsinline', '');
      warmAudio.setAttribute('webkit-playsinline', '');
    }
    warmAudio.src = SILENT_WAV;
    warmAudio.volume = 0.01;
    const p = warmAudio.play();
    if (p) {
      p.then(() => {
        audioUnlocked = true;
        console.log('[Audio] iOS audio unlocked via warm element');
      }).catch(() => {
        console.warn('[Audio] iOS audio unlock failed');
      });
    }
  } catch (e) {
    console.warn('[Audio] unlock error:', e);
  }

  // Also try AudioContext unlock
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (Ctor) {
      const ctx = new Ctor();
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      ctx.resume();
    }
  } catch { /* ignore */ }
}

// Auto-attach unlock on first user interaction
if (typeof window !== 'undefined') {
  const handler = () => {
    unlockAudio();
    window.removeEventListener('touchstart', handler, true);
    window.removeEventListener('touchend', handler, true);
    window.removeEventListener('click', handler, true);
    window.removeEventListener('keydown', handler, true);
  };
  window.addEventListener('touchstart', handler, true);
  window.addEventListener('touchend', handler, true);
  window.addEventListener('click', handler, true);
  window.addEventListener('keydown', handler, true);
}

// ---- Helper: PCM Int16 → WAV data URL ----
function pcmToWavDataUrl(pcmInt16: Int16Array, sampleRate: number): string {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const pcmBytes = new Uint8Array(pcmInt16.buffer, pcmInt16.byteOffset, pcmInt16.byteLength);
  const dataSize = pcmBytes.length;

  const wav = new Uint8Array(44 + dataSize);
  const view = new DataView(wav.buffer);
  
  const w = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  w(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  w(36, 'data');
  view.setUint32(40, dataSize, true);
  wav.set(pcmBytes, 44);

  // Convert to base64 data URL
  let binary = '';
  for (let i = 0; i < wav.length; i++) {
    binary += String.fromCharCode(wav[i]);
  }
  return 'data:audio/wav;base64,' + btoa(binary);
}

// ---- Short UI SFX (Web Audio; prime context in same gesture as delayed playback) ----

let sfxAudioContext: AudioContext | null = null;

/** Call synchronously from a user gesture before a delayed SFX (e.g. boot → setTimeout). */
export function primeSfxAudioContext(): void {
  if (typeof window === 'undefined') return;
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    if (!sfxAudioContext || sfxAudioContext.state === 'closed') {
      sfxAudioContext = new Ctor();
    }
    void sfxAudioContext.resume();
  } catch {
    /* ignore */
  }
}

function getSfxContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    if (!sfxAudioContext || sfxAudioContext.state === 'closed') {
      sfxAudioContext = new Ctor();
    }
    return sfxAudioContext;
  } catch {
    return null;
  }
}

/**
 * CRT / retro PC power-on: oscillator-only (no noise whoosh).
 * Mains hum + internal-speaker-style square chirps + soft "ready" triangle.
 * `volume` is 0–1 (maps to global SFX slider).
 */
export function playCrtBootSfx(volume: number = 0.5): void {
  const v = Math.max(0, Math.min(1, volume));
  if (v <= 0) return;

  const ctx = getSfxContext();
  if (!ctx) return;
  void ctx.resume();

  const now = ctx.currentTime;
  const p = v * 0.3;
  const out = ctx.destination;

  // 1) Subtle mains / transformer hum (CRT era)
  const hum = ctx.createOscillator();
  const gHum = ctx.createGain();
  hum.type = 'sine';
  hum.frequency.value = 118;
  gHum.gain.setValueAtTime(0, now);
  gHum.gain.linearRampToValueAtTime(p * 0.2, now + 0.035);
  gHum.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
  hum.connect(gHum);
  gHum.connect(out);
  hum.start(now);
  hum.stop(now + 0.42);

  // 2) Short square "POST" blips — old PC / terminal speaker
  const blips: { at: number; hz: number; ms: number }[] = [
    { at: 0.01, hz: 392, ms: 65 },
    { at: 0.095, hz: 523, ms: 65 },
    { at: 0.185, hz: 659, ms: 85 },
  ];
  for (const b of blips) {
    const t0 = now + b.at;
    const sec = b.ms / 1000;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = b.hz;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(p * 0.85, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + sec);
    o.connect(g);
    g.connect(out);
    o.start(t0);
    o.stop(t0 + sec + 0.015);
  }

  // 3) Quick sine sweep between blips and "ready" — hardware self-test, not noise
  const tPing = now + 0.275;
  const ping = ctx.createOscillator();
  const gPing = ctx.createGain();
  ping.type = 'sine';
  ping.frequency.setValueAtTime(200, tPing);
  ping.frequency.exponentialRampToValueAtTime(720, tPing + 0.045);
  gPing.gain.setValueAtTime(0, tPing);
  gPing.gain.linearRampToValueAtTime(p * 0.18, tPing + 0.008);
  gPing.gain.exponentialRampToValueAtTime(0.001, tPing + 0.07);
  ping.connect(gPing);
  gPing.connect(out);
  ping.start(tPing);
  ping.stop(tPing + 0.08);

  // 4) Softer triangle "system ready" tail — game/console handshake
  const tri = ctx.createOscillator();
  const gTri = ctx.createGain();
  tri.type = 'triangle';
  tri.frequency.value = 440;
  const tReady = now + 0.33;
  gTri.gain.setValueAtTime(0, tReady);
  gTri.gain.linearRampToValueAtTime(p * 0.45, tReady + 0.018);
  gTri.gain.exponentialRampToValueAtTime(0.001, tReady + 0.36);
  tri.connect(gTri);
  gTri.connect(out);
  tri.start(tReady);
  tri.stop(tReady + 0.4);
}

/**
 * Subtle UI click — short digital glitch (noise tick + micro square blips).
 * `volume` is 0–1 (global SFX slider); internally scaled down so it stays quiet.
 */
export function playClickGlitchSfx(volume: number = 0.5): void {
  const v = Math.max(0, Math.min(1, volume)) * 0.11;
  if (v <= 0) return;

  const ctx = getSfxContext();
  if (!ctx) return;
  void ctx.resume();

  const now = ctx.currentTime;
  const out = ctx.destination;

  const len = Math.ceil(ctx.sampleRate * 0.038);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.85;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800 + Math.random() * 1400;
  bp.Q.value = 3.2;
  const gN = ctx.createGain();
  gN.gain.setValueAtTime(0, now);
  gN.gain.linearRampToValueAtTime(v * 0.55, now + 0.002);
  gN.gain.exponentialRampToValueAtTime(0.001, now + 0.032);
  noise.connect(bp);
  bp.connect(gN);
  gN.connect(out);
  noise.start(now);
  noise.stop(now + 0.042);

  for (let i = 0; i < 2; i++) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = 620 + i * 380 + (Math.random() - 0.5) * 90;
    const t0 = now + i * 0.01;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(v * 0.35, t0 + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.018);
    o.connect(g);
    g.connect(out);
    o.start(t0);
    o.stop(t0 + 0.022);
  }
}

// ---- Playback ----

export interface AudioPlayback {
  stop: () => void;
  setVolume: (v: number) => void;
  finished: Promise<void>;
}

/**
 * Play audio from a blob URL.
 * Uses cached PCM → WAV data URL → pre-unlocked HTMLAudioElement.
 */
export async function playAudioFromUrl(blobUrl: string, volume: number = 1): Promise<AudioPlayback> {
  
  // Strategy 1: Use cached PCM data + warm Audio element (iOS Safari compatible)
  const cached = pcmCache.get(blobUrl);
  if (cached) {
    
    const dataUrl = pcmToWavDataUrl(cached.pcmData, cached.sampleRate);
    
    // Use the warm (pre-unlocked) audio element if available
    const audio = warmAudio || new Audio();
    audio.volume = volume;
    audio.src = dataUrl;
    
    const finished = new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = (e) => {
        console.error('[Audio] playback error:', e);
        resolve();
      };
    });

    try {
      await audio.play();
    } catch (e: any) {
      console.error('[Audio] play() failed:', e);
    }

    return {
      stop: () => { audio.pause(); audio.currentTime = 0; },
      setVolume: (v: number) => { audio.volume = v; },
      finished
    };
  }

  // Strategy 2: Direct blob URL with HTMLAudioElement — reuse warm element on iOS
  console.warn('[Audio] No PCM cache, using HTMLAudioElement fallback');
  const audio = warmAudio || new Audio();
  audio.src = blobUrl;
  audio.volume = volume;

  const finished = new Promise<void>((resolve) => {
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
  });

  try {
    await audio.play();
  } catch (e: any) {
    console.error('[Audio] fallback play failed:', e);
  }

  return {
    stop: () => { audio.pause(); audio.currentTime = 0; },
    setVolume: (v: number) => { audio.volume = v; },
    finished
  };
}
