"""
Map model-produced revealedEvidence strings onto canonical hiddenEvidence titles
so chips/collection resolve to real Evidence rows (image + description).
"""
from __future__ import annotations
import re
from dataclasses import dataclass
from typing import Optional


@dataclass
class EvidenceTitleMatch:
    id: str
    title: str
    description: Optional[str] = None


def strip_revealed_evidence_metadata(line: str) -> str:
    s = line.strip()
    idx = re.search(r"\s*\|\s*DISCOVERY_ZONE\b", s, re.IGNORECASE)
    return s[: idx.start()].strip() if idx else s


def _levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    m, n = len(a), len(b)
    if m == 0:
        return n
    if n == 0:
        return m
    row = list(range(n + 1))
    for i in range(1, m + 1):
        prev = i - 1
        row[0] = i
        for j in range(1, n + 1):
            tmp = row[j]
            cost = 0 if a[i - 1] == b[j - 1] else 1
            row[j] = min(row[j] + 1, row[j - 1] + 1, prev + cost)
            prev = tmp
    return row[n]


def _lev_similarity(a: str, b: str) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    d = _levenshtein(a, b)
    return 1.0 - d / max(len(a), len(b), 1)


def _normalize_loose(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[''`]", "", s)
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def _token_jaccard(a: str, b: str) -> float:
    ta = {w for w in _normalize_loose(a).split(" ") if len(w) > 2}
    tb = {w for w in _normalize_loose(b).split(" ") if len(w) > 2}
    if not ta and not tb:
        return 1.0
    if not ta or not tb:
        return 0.0
    inter = len(ta & tb)
    return inter / (len(ta) + len(tb) - inter)


def map_reveal_line_to_hidden_title(
    raw_line: str,
    candidates: list[EvidenceTitleMatch],
    min_fuzzy_score: float = 0.72,
) -> Optional[str]:
    """Returns the canonical Evidence.title from candidates for one raw model line, or None."""
    if not candidates:
        return None

    full = strip_revealed_evidence_metadata(raw_line).strip()
    if not full:
        return None

    probe = full
    if not re.search(r"\b(WHERE_HIDDEN|DETAIL)\b", full, re.IGNORECASE) and ":" in full:
        probe = full.split(":")[0].strip()

    p_low = probe.lower()
    f_low = full.lower()

    # Exact match on title
    for e in candidates:
        t = e.title.strip()
        if not t:
            continue
        tl = t.lower()
        if tl == p_low or tl == f_low:
            return t

    # Exact match on description
    for e in candidates:
        d = (e.description or "").strip()
        if d and d.lower() == f_low:
            return e.title

    # Substring match
    best_sub: Optional[EvidenceTitleMatch] = None
    for e in candidates:
        tl = e.title.lower()
        if len(tl) < 4:
            continue
        if tl in p_low or tl in f_low:
            if not best_sub or len(e.title) > len(best_sub.title):
                best_sub = e
    if best_sub:
        return best_sub.title

    for e in candidates:
        tl = e.title.lower()
        if len(tl) < 4 or len(p_low) < 4:
            continue
        if tl in p_low or p_low in tl:
            if not best_sub or len(e.title) > len(best_sub.title):
                best_sub = e
    if best_sub:
        return best_sub.title

    # Fuzzy match
    best: Optional[EvidenceTitleMatch] = None
    best_score = 0.0
    for e in candidates:
        t = e.title
        lev = max(_lev_similarity(p_low, t.lower()), _lev_similarity(f_low, t.lower()))
        jac = max(_token_jaccard(probe, t), _token_jaccard(full, t))
        score = max(lev * 0.55 + jac * 0.45, lev, jac * 0.95)
        if score > best_score:
            best_score = score
            best = e

    if best and best_score >= min_fuzzy_score:
        return best.title
    return None


def normalize_revealed_evidence_titles(
    raw_lines: list[str],
    unrevealed_hidden: list[EvidenceTitleMatch],
    min_fuzzy_score: float = 0.72,
) -> list[str]:
    """Map every raw reveal to canonical titles; drop hallucinations; dedupe preserving order."""
    seen: set[str] = set()
    out: list[str] = []
    for line in raw_lines:
        canon = map_reveal_line_to_hidden_title(line, unrevealed_hidden, min_fuzzy_score)
        if not canon:
            continue
        key = canon.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(canon)
    return out
