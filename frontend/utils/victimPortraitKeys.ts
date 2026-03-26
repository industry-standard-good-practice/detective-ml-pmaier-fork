import { Suspect } from '../types';

/** Must match backend `victimPortraitKey.ts` — prefix for per–environment-clue scene portraits. */
export const ENV_SCENE_PORTRAIT_PREFIX = 'ENVSCENE_' as const;

export function environmentScenePortraitKey(evidenceId: string): string {
  const safe = evidenceId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${ENV_SCENE_PORTRAIT_PREFIX}${safe}`;
}

/**
 * Maps chat `emotion` + optional `environmentEvidenceId` to the `portraits` key used for the victim card.
 * Uses pregenerated `ENVSCENE_*` URLs when available; falls back to generic `ENVIRONMENT` or body keys.
 */
export function resolveVictimExaminationPortraitKey(
  suspect: Suspect,
  emotion: string,
  environmentEvidenceId?: string | null
): string {
  if (!suspect.isDeceased) return emotion;

  const portraits = suspect.portraits;
  const envEvs = (suspect.hiddenEvidence || []).filter(e => e.discoveryContext === 'environment');

  const em = emotion.trim();
  if (em.toUpperCase() === 'ENVIRONMENT') {
    const id = (environmentEvidenceId || '').trim();
    if (id && envEvs.some(e => e.id === id)) {
      const k = environmentScenePortraitKey(id);
      if (portraits?.[k]) return k;
    }
    if (envEvs.length === 1) {
      const k = environmentScenePortraitKey(envEvs[0].id);
      if (portraits?.[k]) return k;
    }
    return 'ENVIRONMENT';
  }

  return em.toUpperCase() === 'NEUTRAL' ||
    ['HEAD', 'TORSO', 'HANDS', 'LEGS'].includes(em.toUpperCase())
    ? em.toUpperCase()
    : em;
}
