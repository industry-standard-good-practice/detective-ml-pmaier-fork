/**
 * Model returns victim hidden-clue lines like:
 *   TITLE | DISCOVERY_ZONE: environment | WHERE_HIDDEN: ... | DETAIL: ...
 * UI and collection logic must use the human title only.
 */

const DISCOVERY_ZONE_SPLIT = /\s*\|\s*DISCOVERY_ZONE\b/i;

/** Title only, for chips, celebration, and matching case evidence. */
export function sanitizeEvidenceRevealTitle(raw: string): string {
  const s = raw.trim();
  const idx = s.search(DISCOVERY_ZONE_SPLIT);
  if (idx >= 0) return s.slice(0, idx).trim();
  return s;
}

/** Parse for collectEvidence: title + optional description from DETAIL or legacy "Title: desc". */
export function parseRevealedEvidenceForCollection(raw: string): { title: string; descriptionHint?: string } {
  const full = raw.trim();
  const title = sanitizeEvidenceRevealTitle(full);
  const detailM = full.match(/\|\s*DETAIL:\s*([\s\S]+)$/i);
  if (detailM?.[1]?.trim()) {
    return { title, descriptionHint: detailM[1].trim() };
  }
  if (!full.match(DISCOVERY_ZONE_SPLIT) && title.includes(':')) {
    const parts = full.split(':');
    const legacyTitle = parts[0].trim();
    const rest = parts.slice(1).join(':').trim();
    return { title: legacyTitle, descriptionHint: rest || undefined };
  }
  return { title };
}
