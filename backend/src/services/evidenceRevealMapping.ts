/**
 * Map model-produced revealedEvidence strings onto canonical hiddenEvidence titles
 * so chips/collection resolve to real Evidence rows (image + description).
 */

export interface EvidenceTitleMatch {
  id: string;
  title: string;
  description?: string;
}

export function stripRevealedEvidenceMetadata(line: string): string {
  const s = line.trim();
  const idx = s.search(/\s*\|\s*DISCOVERY_ZONE\b/i);
  return idx >= 0 ? s.slice(0, idx).trim() : s;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[n];
}

function levSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const d = levenshtein(a, b);
  return 1 - d / Math.max(a.length, b.length, 1);
}

function normalizeLoose(s: string): string {
  return s
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenJaccard(a: string, b: string): number {
  const ta = new Set(
    normalizeLoose(a)
      .split(' ')
      .filter((w) => w.length > 2)
  );
  const tb = new Set(
    normalizeLoose(b)
      .split(' ')
      .filter((w) => w.length > 2)
  );
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const w of ta) {
    if (tb.has(w)) inter++;
  }
  return inter / (ta.size + tb.size - inter);
}

export interface MapRevealOptions {
  /** Minimum composite score to accept a fuzzy match (0–1). */
  minFuzzyScore?: number;
}

/**
 * Returns the canonical `Evidence.title` from `candidates` for one raw model line, or null if no safe match.
 */
export function mapRevealLineToHiddenTitle(
  rawLine: string,
  candidates: EvidenceTitleMatch[],
  opts?: MapRevealOptions
): string | null {
  const minFuzzy = opts?.minFuzzyScore ?? 0.72;
  if (!candidates.length) return null;

  const full = stripRevealedEvidenceMetadata(rawLine).trim();
  if (!full) return null;

  let probe = full;
  if (!/\b(WHERE_HIDDEN|DETAIL)\b/i.test(full) && full.includes(':')) {
    probe = full.split(':')[0].trim();
  }

  const pLow = probe.toLowerCase();
  const fLow = full.toLowerCase();

  for (const e of candidates) {
    const t = e.title.trim();
    if (!t) continue;
    const tl = t.toLowerCase();
    if (tl === pLow || tl === fLow) return t;
  }

  for (const e of candidates) {
    const d = (e.description || '').trim();
    if (d && d.toLowerCase() === fLow) return e.title;
  }

  let bestSub: EvidenceTitleMatch | null = null;
  for (const e of candidates) {
    const tl = e.title.toLowerCase();
    if (tl.length < 4) continue;
    if (pLow.includes(tl) || fLow.includes(tl)) {
      if (!bestSub || e.title.length > bestSub.title.length) bestSub = e;
    }
  }
  if (bestSub) return bestSub.title;

  for (const e of candidates) {
    const tl = e.title.toLowerCase();
    if (tl.length < 4 || pLow.length < 4) continue;
    if (tl.includes(pLow) || pLow.includes(tl)) {
      if (!bestSub || e.title.length > bestSub.title.length) bestSub = e;
    }
  }
  if (bestSub) return bestSub.title;

  let best: EvidenceTitleMatch | null = null;
  let bestScore = 0;
  for (const e of candidates) {
    const t = e.title;
    const lev = Math.max(levSimilarity(pLow, t.toLowerCase()), levSimilarity(fLow, t.toLowerCase()));
    const jac = Math.max(tokenJaccard(probe, t), tokenJaccard(full, t));
    const score = Math.max(lev * 0.55 + jac * 0.45, lev, jac * 0.95);
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }

  if (best && bestScore >= minFuzzy) return best.title;
  return null;
}

/**
 * Map every raw reveal to canonical titles; drop hallucinations; dedupe preserving order.
 */
export function normalizeRevealedEvidenceTitles(
  rawLines: string[],
  unrevealedHidden: EvidenceTitleMatch[],
  opts?: MapRevealOptions
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of rawLines) {
    const canon = mapRevealLineToHiddenTitle(line, unrevealedHidden, opts);
    if (!canon) continue;
    const key = canon.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(canon);
  }
  return out;
}
