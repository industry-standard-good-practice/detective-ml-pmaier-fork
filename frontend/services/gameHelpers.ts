
export const getSuspectColor = (seed: number) => {
  const colors = [
    '#500', // Red
    '#050', // Green
    '#005', // Blue
    '#550', // Yellow
    '#505', // Magenta
    '#055', // Cyan
    '#333', // Gray
    '#420', // Brown
    '#204', // Purple
    '#042'  // Teal
  ];
  return colors[seed % colors.length];
};

export const getSuspectBackingColor = (seed: number) => {
  const colors = [
    '#300', '#030', '#003', '#330', '#303', '#033', '#222', '#210', '#102', '#021'
  ];
  return colors[seed % colors.length];
};

export const getSuspectColorDescription = (seed: number) => {
  const descriptions = [
    'crimson', 'emerald', 'sapphire', 'amber', 'amethyst', 'cyan', 'slate', 'sepia', 'violet', 'teal'
  ];
  return descriptions[seed % descriptions.length];
};

export const getPixelArtUrl = (seed: number | string, type: string | number = 'human') => {
  const size = typeof type === 'number' ? `${type}/${type}` : (type === 'human' ? '400/400' : '800/600');
  return `https://picsum.photos/seed/${seed}/${size}?blur=2`;
};

/**
 * Computes a dynamic display status based on current aggravation level.
 * Used during gameplay so the card status updates live as the player
 * pushes suspects harder in interrogation.
 * 
 * @param baseStatus - The AI-generated or user-edited status from case data
 * @param currentAggravation - The live aggravation level (0-100)
 * @param isDeceased - Whether the suspect is dead (victim)
 */
export const getDisplayStatus = (
  baseStatus: string | undefined,
  currentAggravation: number,
  isDeceased?: boolean
): string => {
  if (isDeceased) return baseStatus || 'Deceased';

  // Map aggravation ranges to demeanor-based status labels
  if (currentAggravation >= 100) return 'Lawyered Up';
  if (currentAggravation >= 85) return 'Refusing to Speak';
  if (currentAggravation >= 70) return 'Hostile';
  if (currentAggravation >= 55) return 'Agitated';
  if (currentAggravation >= 40) return 'On Edge';
  if (currentAggravation >= 25) return 'Guarded';

  // Below 25: use the base status from case data (AI-generated flavor)
  return baseStatus || 'Cooperative';
};
