/**
 * Maps victim hidden evidence to examination "portrait" keys (body regions + room).
 * Environmental clues each get a dedicated scene portrait: ENVSCENE_<sanitizedEvidenceId>.
 */

export const ENV_SCENE_PORTRAIT_PREFIX = 'ENVSCENE_' as const;

/** Stable portrait / storage key for one environmental hidden-evidence beat. */
export function environmentScenePortraitKey(evidenceId: string): string {
  const safe = evidenceId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${ENV_SCENE_PORTRAIT_PREFIX}${safe}`;
}

export function inferVictimPortraitKeyForEvidence(ev: {
  id: string;
  discoveryContext?: string;
  location?: string;
  title?: string;
  description?: string;
}): string {
  if (ev.discoveryContext === 'environment') {
    return environmentScenePortraitKey(ev.id);
  }

  const text = [ev.location, ev.title, ev.description].filter(Boolean).join(' ').toLowerCase();

  if (
    /\b(head|face|faces|facial|scalp|hair|ear|ears|mouth|lip|lips|nose|temple|temples|jaw|chin|cheek|cheeks|brow|brows|throat)\b/.test(
      text
    )
  ) {
    return 'HEAD';
  }
  if (
    /\b(hand|hands|finger|fingers|fingertip|nail|nails|palm|palms|wrist|wrists|knuckle|glove|gloves)\b/.test(text)
  ) {
    return 'HANDS';
  }
  if (
    /\b(leg|legs|foot|feet|shoe|shoes|shoelace|sock|socks|ankle|ankles|knee|knees|thigh|cuff|hem|sole|toe|toes)\b/.test(
      text
    )
  ) {
    return 'LEGS';
  }

  return 'TORSO';
}
