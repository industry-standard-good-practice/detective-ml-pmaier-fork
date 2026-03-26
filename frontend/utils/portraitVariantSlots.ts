import { Emotion } from '../types';
import type { Suspect, SupportCharacter } from '../types';
import { environmentScenePortraitKey } from './victimPortraitKeys';

export interface PortraitVariantSlot {
  key: string;
  label: string;
}

/** Matches backend `generateEmotionalVariants` emotion list (living + support). */
const LIVING_VARIANT_ORDER: string[] = [
  Emotion.NEUTRAL,
  Emotion.HAPPY,
  Emotion.ANGRY,
  Emotion.SAD,
  Emotion.NERVOUS,
  Emotion.SURPRISED,
  Emotion.SLY,
  Emotion.CONTENT,
  Emotion.DEFENSIVE,
  Emotion.ARROGANT,
];

function labelForEmotionKey(key: string): string {
  if (key === Emotion.NEUTRAL) return 'Neutral';
  return key.charAt(0) + key.slice(1).toLowerCase();
}

/**
 * Ordered slots for the case-review portrait editor carousel (per variant file on disk).
 * Deceased victims include forensic views + one entry per environment hidden-evidence scene.
 */
export function getPortraitVariantSlots(char: Suspect | SupportCharacter): PortraitVariantSlot[] {
  const isSuspect = 'isGuilty' in char;
  const deceased = isSuspect && (char as Suspect).isDeceased;

  if (!deceased) {
    return LIVING_VARIANT_ORDER.map((key) => ({ key, label: labelForEmotionKey(key) }));
  }

  const victim = char as Suspect;
  const slots: PortraitVariantSlot[] = [
    { key: 'NEUTRAL', label: 'Neutral' },
    { key: 'HEAD', label: 'Head' },
    { key: 'TORSO', label: 'Torso' },
    { key: 'HANDS', label: 'Hands' },
    { key: 'LEGS', label: 'Legs' },
    { key: 'ENVIRONMENT', label: 'Room' },
  ];

  (victim.hiddenEvidence || []).forEach((ev) => {
    if (ev.discoveryContext === 'environment') {
      const k = environmentScenePortraitKey(ev.id);
      const title = (ev.title || 'Scene').trim();
      slots.push({
        key: k,
        label: title.length > 28 ? `${title.slice(0, 26)}…` : title,
      });
    }
  });

  return slots;
}
