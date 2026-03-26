/**
 * Model returns victim hidden-clue lines like:
 *   TITLE | DISCOVERY_ZONE: environment | WHERE_HIDDEN: ... | DETAIL: ...
 * UI and collection logic must use the human title only.
 */

import type { CaseData, Evidence } from '../types';

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

/** Collect all Evidence rows from a case (initial + every suspect's hidden list) for title resolution. */
export function buildEvidenceSearchList(activeCase: CaseData): Evidence[] {
  const out: Evidence[] = [...(activeCase.initialEvidence || [])];
  for (const s of activeCase.suspects || []) {
    out.push(...(s.hiddenEvidence || []));
  }
  return out;
}

function shortTitleFromRevealString(raw: string): string {
  const cleaned = sanitizeEvidenceRevealTitle(raw);
  if (cleaned.includes(':') && !/\b(WHERE_HIDDEN|DETAIL)\b/i.test(cleaned)) {
    return cleaned.split(':')[0].trim();
  }
  return cleaned;
}

/**
 * Prefer canonical `Evidence.title` when the model sent a full description, prose, or pipe-formatted line.
 * Used for chat chips so the button shows a short title, not the full discovery text.
 */
export function resolveEvidenceDisplayTitle(raw: string | null | undefined, searchIn: Evidence[]): string {
  if (!raw?.trim()) return '';
  const trimmed = raw.trim();
  const sanitized = sanitizeEvidenceRevealTitle(trimmed);
  const lower = trimmed.toLowerCase();
  const sanLower = sanitized.toLowerCase();

  if (searchIn.length === 0) {
    return shortTitleFromRevealString(trimmed);
  }

  for (const ev of searchIn) {
    if (ev.description?.trim() && ev.description.trim().toLowerCase() === lower) {
      return ev.title;
    }
  }

  for (const ev of searchIn) {
    if (ev.title.toLowerCase() === sanLower) {
      return ev.title;
    }
  }

  let best: Evidence | null = null;
  for (const ev of searchIn) {
    const t = ev.title.toLowerCase();
    if (t.length < 3) continue;
    if (lower.includes(t)) {
      if (!best || ev.title.length > best.title.length) {
        best = ev;
      }
    }
  }
  if (best) return best.title;

  for (const ev of searchIn) {
    const d = ev.description?.trim();
    if (!d) continue;
    const dl = d.toLowerCase();
    const prefixLen = Math.min(120, dl.length);
    if (prefixLen >= 12 && lower.startsWith(dl.slice(0, prefixLen))) {
      return ev.title;
    }
  }

  return shortTitleFromRevealString(trimmed);
}
