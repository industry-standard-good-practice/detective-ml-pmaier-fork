/**
 * Merges `voiceAccent` from case editor into the TTS style prompt.
 * Deceased-victim forensic `voiceStyle` historically omitted accent; legacy cases
 * may also have accent-only edits without a refreshed `voiceStyle`.
 */
export function mergeVoiceAccentIntoStyle(
  voiceStyle: string | undefined,
  voiceAccent: string | undefined
): string | undefined {
  const trimmed = voiceAccent?.trim();
  if (!trimmed) return voiceStyle;

  const accentLine = `Accent: Speak with a ${trimmed} accent. This should be consistent and natural throughout the entire delivery.`;

  let base = (voiceStyle || '').trim();
  if (base.includes(accentLine)) return base;

  base = base
    .replace(/\n*Accent: Speak with a [^\n]+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return base ? `${base}\n\n${accentLine}` : accentLine;
}
