"""
Case generation, consistency checking, editing, difficulty calculation,
voice style generation, relationship/timeline enforcement.
Port of geminiCase.ts (~2816 lines).
"""
from __future__ import annotations
import asyncio
import copy
import json
import math
import re
import time
from datetime import datetime
from typing import Any

from .gemini_client import ai
from .gemini_models import GEMINI_MODELS, generate_with_text_model
from .gemini_images import (
    generate_evidence_image,
    regenerate_single_suspect,
    ensure_victim_examination_portraits,
)
from .victim_portrait_key import (
    infer_victim_portrait_key_for_evidence,
    environment_scene_portrait_key,
)


# ---------- TTS VOICE CONSTANTS ----------
TTS_VOICES = [
    {"name": "Achernar", "gender": "Female"}, {"name": "Achird", "gender": "Male"},
    {"name": "Algenib", "gender": "Male"}, {"name": "Algieba", "gender": "Female"},
    {"name": "Alnilam", "gender": "Female"}, {"name": "Aoede", "gender": "Female"},
    {"name": "Autonoe", "gender": "Female"}, {"name": "Callirrhoe", "gender": "Female"},
    {"name": "Charon", "gender": "Male"}, {"name": "Despina", "gender": "Female"},
    {"name": "Enceladus", "gender": "Male"}, {"name": "Erinome", "gender": "Female"},
    {"name": "Fenrir", "gender": "Female"}, {"name": "Gacrux", "gender": "Female"},
    {"name": "Iapetus", "gender": "Male"}, {"name": "Kore", "gender": "Female"},
    {"name": "Laomedeia", "gender": "Female"}, {"name": "Leda", "gender": "Female"},
    {"name": "Orus", "gender": "Male"}, {"name": "Pulcherrima", "gender": "Female"},
    {"name": "Puck", "gender": "Male"}, {"name": "Rasalgethi", "gender": "Male"},
    {"name": "Sadachbia", "gender": "Female"}, {"name": "Sadaltager", "gender": "Female"},
    {"name": "Schedar", "gender": "Male"}, {"name": "Sulafat", "gender": "Female"},
    {"name": "Umbriel", "gender": "Female"}, {"name": "Vindemiatrix", "gender": "Female"},
    {"name": "Zephyr", "gender": "Female"}, {"name": "Zubenelgenubi", "gender": "Male"},
]

import random as _random


def get_random_voice(gender: str) -> str:
    filtered = [v for v in TTS_VOICES if v["gender"].lower() == gender.lower()]
    pool = filtered if filtered else TTS_VOICES
    return _random.choice(pool)["name"]


# ---------- VOICE STYLE GENERATION ----------

def generate_voice_style(character: dict, case_description: str) -> str:
    if character.get("isDeceased"):
        forensic = (
            "# AUDIO PROFILE: Forensic Narrator\n"
            "## Scene: A dimly lit examination room at the police station.\n"
            "### DIRECTOR'S NOTES\n"
            "Style: Clinical, detached, documentary-style narration. Speak as a forensic examiner "
            "describing findings during a body examination. Calm, professional, and measured.\n"
            "Pacing: Slow and deliberate, with pauses between observations."
        )
        accent = (character.get("voiceAccent") or "").strip()
        if accent:
            return f"{forensic}\n\nAccent: Speak with a {accent} accent. This should be consistent and natural throughout the entire delivery."
        return forensic

    age_desc = f"{character['age']}-year-old" if character.get("age") else ""
    gender_desc = character.get("gender", "")
    lines: list[str] = []
    lines.append(f"# AUDIO PROFILE: {character.get('name', '')}")
    lines.append(f'## "{character.get("role", "")}"')
    lines.append("")
    lines.append("## THE SCENE: Police interrogation room")
    ctx = f" Context: {case_description[:200]}" if case_description else ""
    lines.append(
        f"{character.get('name', '')} is sitting across from a detective in a stark interrogation room. "
        f"The atmosphere is tense.{ctx}"
    )
    lines.append("")
    lines.append("### DIRECTOR'S NOTES")

    personality = character.get("personality", "guarded")
    lines.append(
        f"Style: Speak as a {age_desc} {gender_desc} {character.get('role', '').lower()} "
        f"being questioned by police. {personality}. The voice should reflect someone under pressure "
        "in an interrogation — not a narrator or announcer."
    )

    accent = (character.get("voiceAccent") or "").strip()
    if accent:
        lines.append(f"Accent: Speak with a {accent} accent. This should be consistent and natural throughout the entire delivery.")

    pl = personality.lower()
    if any(w in pl for w in ("nervous", "anxious", "jittery")):
        lines.append("Pacing: Speaks quickly and unevenly, with occasional stammers and hesitations.")
    elif any(w in pl for w in ("calm", "composed", "stoic", "cold")):
        lines.append("Pacing: Measured and controlled. Deliberate pauses between statements. Never rushes.")
    elif any(w in pl for w in ("aggressive", "hostile", "angry", "volatile")):
        lines.append("Pacing: Forceful and punchy. Short, clipped sentences. Builds in intensity.")
    elif any(w in pl for w in ("arrogant", "smug", "condescending")):
        lines.append("Pacing: Leisurely and self-assured. Speaks as if doing the detective a favor.")
    elif any(w in pl for w in ("sad", "grief", "mourning", "depressed")):
        lines.append("Pacing: Slow and heavy. Words come out with effort. Long pauses. Voice may crack.")
    elif any(w in pl for w in ("friendly", "cooperative", "eager", "chatty")):
        lines.append("Pacing: Conversational and warm. Natural rhythm with occasional enthusiasm.")
    elif any(w in pl for w in ("evasive", "cagey", "secretive", "guarded")):
        lines.append("Pacing: Careful and measured. Gives short answers. Pauses before responding.")
    else:
        lines.append("Pacing: Natural conversational pace appropriate for a police interrogation.")

    return "\n".join(lines)


def generate_voice_styles(case_data: dict) -> None:
    desc = case_data.get("description", "")
    if case_data.get("officer"):
        case_data["officer"]["voiceStyle"] = generate_voice_style({**case_data["officer"], "isDeceased": False}, desc)
    if case_data.get("partner"):
        case_data["partner"]["voiceStyle"] = generate_voice_style({**case_data["partner"], "isDeceased": False}, desc)
    for s in case_data.get("suspects", []):
        s["voiceStyle"] = generate_voice_style(s, desc)


def enforce_voice_styles(case_data: dict, original_case: dict | None = None) -> None:
    desc = case_data.get("description", "")
    orig_suspects = (original_case or {}).get("suspects", [])

    def sanitize(char: dict):
        if isinstance(char.get("voiceAccent"), str) and not char["voiceAccent"].strip():
            del char["voiceAccent"]

    if case_data.get("officer"):
        sanitize(case_data["officer"])
        if not case_data["officer"].get("voiceAccent") and (original_case or {}).get("officer", {}).get("voiceAccent"):
            case_data["officer"]["voiceAccent"] = original_case["officer"]["voiceAccent"]
        if not case_data["officer"].get("voiceAccent"):
            case_data["officer"]["voiceAccent"] = "General American"
        case_data["officer"]["voiceStyle"] = generate_voice_style({**case_data["officer"], "isDeceased": False}, desc)

    if case_data.get("partner"):
        sanitize(case_data["partner"])
        if not case_data["partner"].get("voiceAccent") and (original_case or {}).get("partner", {}).get("voiceAccent"):
            case_data["partner"]["voiceAccent"] = original_case["partner"]["voiceAccent"]
        if not case_data["partner"].get("voiceAccent"):
            case_data["partner"]["voiceAccent"] = "General American"
        case_data["partner"]["voiceStyle"] = generate_voice_style({**case_data["partner"], "isDeceased": False}, desc)

    for s in case_data.get("suspects", []):
        sanitize(s)
        orig = next((o for o in orig_suspects if o.get("id") == s.get("id")), None)
        if not s.get("voiceAccent") and orig and orig.get("voiceAccent"):
            s["voiceAccent"] = orig["voiceAccent"]
        if not s.get("voiceAccent"):
            s["voiceAccent"] = "General American"
        s["voiceStyle"] = generate_voice_style(s, desc)


# ---------- VOICE ACCENT INFERENCE ----------

_ACCENT_PATTERNS: list[tuple[str, str]] = [
    (r"\b(brooklyn|bronx|queens|new york|nyc|manhattan)\b", "New York"),
    (r"\b(boston|massachusetts|bostonian)\b", "Boston"),
    (r"\b(southern|dixie|georgia|alabama|mississippi|tennessee|texas|louisiana|cajun|bayou|drawl)\b", "Southern American"),
    (r"\b(midwest|chicago|wisconsin|minnesota|iowa)\b", "Midwestern American"),
    (r"\b(california|valley|surfer|laid-back|cali)\b", "Californian"),
    (r"\b(british|english|london|oxford|cambridge|eton|posh|aristocrat)\b", "British"),
    (r"\b(irish|ireland|dublin)\b", "Irish"),
    (r"\b(scottish|scotland|edinburgh|glasgow)\b", "Scottish"),
    (r"\b(french|paris|france|français)\b", "French"),
    (r"\b(italian|italy|rome|milan|sicily|naples)\b", "Italian"),
    (r"\b(russian|moscow|soviet|siberia)\b", "Russian"),
    (r"\b(german|berlin|munich|bavarian)\b", "German"),
    (r"\b(spanish|spain|madrid|barcelona)\b", "Spanish"),
    (r"\b(australian|aussie|sydney|melbourne)\b", "Australian"),
    (r"\b(japanese|tokyo|japan)\b", "Japanese"),
    (r"\b(chinese|beijing|shanghai|mandarin|cantonese)\b", "Chinese"),
    (r"\b(indian|mumbai|delhi|hindu|bollywood)\b", "Indian"),
    (r"\b(jamaican|kingston|reggae|caribbean)\b", "Jamaican"),
    (r"\b(mexican|mexico|guadalajara)\b", "Mexican"),
    (r"\b(professor|academic|scholar|intellectual|university)\b", "educated and articulate"),
    (r"\b(street|gang|thug|dealer|hood)\b", "street-smart urban"),
    (r"\b(country|rural|farm|ranch)\b", "rural American"),
    (r"\b(military|soldier|marine|sergeant|officer|veteran)\b", "clipped military"),
]


def infer_voice_accent(character: dict) -> str | None:
    text = " ".join(filter(None, [
        character.get("bio", ""), character.get("professionalBackground", ""),
        character.get("role", ""), character.get("name", ""), character.get("personality", ""),
    ])).lower()
    for pattern, accent in _ACCENT_PATTERNS:
        if re.search(pattern, text):
            return accent
    return None


def infer_voice_accents(case_data: dict) -> None:
    def is_empty(val: Any) -> bool:
        return not val or (isinstance(val, str) and not val.strip())
    if case_data.get("officer") and is_empty(case_data["officer"].get("voiceAccent")):
        case_data["officer"]["voiceAccent"] = infer_voice_accent(case_data["officer"])
    if case_data.get("partner") and is_empty(case_data["partner"].get("voiceAccent")):
        case_data["partner"]["voiceAccent"] = infer_voice_accent(case_data["partner"])
    for s in case_data.get("suspects", []):
        if is_empty(s.get("voiceAccent")):
            s["voiceAccent"] = infer_voice_accent(s)


# ---------- HELPERS ----------

def calculate_difficulty(case_data: dict) -> str:
    suspects = case_data.get("suspects", [])
    alive = [s for s in suspects if not s.get("isDeceased")]
    suspect_count = len(alive)
    ie_count = len(case_data.get("initialEvidence", []))
    he_count = sum(len(s.get("hiddenEvidence", [])) for s in suspects)
    it_count = len(case_data.get("initialTimeline", []))
    total_ev = ie_count + he_count
    victim_count = sum(1 for s in suspects if s.get("isDeceased"))
    guilty_count = sum(1 for s in suspects if s.get("isGuilty"))
    points = suspect_count * 2 + total_ev - it_count * 0.5
    if victim_count > 1:
        points += (victim_count - 1) * 4
    if guilty_count > 1:
        points += (guilty_count - 1) * 5
    if alive:
        avg_agg = sum(s.get("baseAggravation", 0) for s in alive) / len(alive)
        points += (avg_agg / 100) * 6
    charges = case_data.get("partnerCharges", 3) or 3
    if charges < 3:
        points += (3 - charges) * 3
    elif charges > 3:
        points -= (charges - 3) * 2
    if points > 28:
        return "Hard"
    if points >= 20:
        return "Medium"
    return "Easy"


def compute_user_diff(baseline: dict, current: dict) -> dict:
    diff: dict = {}
    for f in ("title", "type", "description"):
        if baseline.get(f) != current.get(f):
            diff[f] = current.get(f)
    for key in ("officer", "partner"):
        bc, cc = baseline.get(key, {}), current.get(key, {})
        if bc and cc:
            cd: dict = {}
            for f in ("name", "gender", "role", "personality"):
                if bc.get(f) != cc.get(f):
                    cd[f] = cc.get(f)
            if cd:
                diff[f"_{key}"] = cd
    suspect_diffs: dict = {}
    suspect_fields = [
        "name", "gender", "age", "role", "status", "bio", "personality", "secret", "motive",
        "physicalDescription", "professionalBackground", "witnessObservations",
        "isGuilty", "isDeceased", "baseAggravation",
    ]
    for s in current.get("suspects", []):
        bs = next((b for b in baseline.get("suspects", []) if b.get("id") == s.get("id")), None)
        if not bs:
            continue
        fd: dict = {}
        for f in suspect_fields:
            if json.dumps(bs.get(f), sort_keys=True) != json.dumps(s.get(f), sort_keys=True):
                fd[f] = s.get(f)
        if json.dumps(bs.get("alibi"), sort_keys=True) != json.dumps(s.get("alibi"), sort_keys=True):
            fd["alibi"] = s.get("alibi")
        if fd:
            suspect_diffs[s["id"]] = fd
    if suspect_diffs:
        diff["_suspects"] = suspect_diffs
    print(f"[DEBUG] computeUserDiff: User manually changed: {diff if diff else 'nothing'}")
    return diff


def format_user_change_log(diff: dict, baseline: dict) -> str:
    if not diff:
        return ""
    lines: list[str] = []
    if diff.get("title"):
        lines.append(f'- Case title changed to: "{diff["title"]}"')
    if diff.get("type"):
        lines.append(f'- Case type changed to: "{diff["type"]}"')
    if diff.get("description"):
        lines.append("- Case description was rewritten by the user")
    for key in ("officer", "partner"):
        cd = diff.get(f"_{key}")
        if cd:
            label = "Officer/Chief" if key == "officer" else "Partner"
            orig_char = baseline.get(key, {})
            for field, value in cd.items():
                old_val = orig_char.get(field, "unknown")
                lines.append(f'- {label}\'s {field} changed from "{old_val}" to "{value}"')
    sd = diff.get("_suspects")
    if sd:
        for sid, fields in sd.items():
            bs = next((s for s in baseline.get("suspects", []) if s.get("id") == sid), None)
            label = bs["name"] if bs else sid
            for field, value in fields.items():
                old_val = bs.get(field, "unknown") if bs else "unknown"
                if field == "name":
                    lines.append(f'- Suspect "{old_val}" was RENAMED to "{value}" — this is the COMPLETE new name. Use "{value}" EXACTLY and COMPLETELY. Do NOT keep any part of the old name "{old_val}". Update ALL references to this character everywhere.')
                elif field == "isGuilty":
                    lines.append(f'- Suspect "{label}" guilt status changed to: {"GUILTY" if value else "INNOCENT"}')
                elif field == "isDeceased":
                    lines.append(f'- Suspect "{label}" deceased status changed to: {"DECEASED (victim)" if value else "ALIVE"}')
                elif field == "alibi" and isinstance(value, dict):
                    lines.append(f'- Suspect "{label}"\'s alibi was modified by the user')
                elif isinstance(value, str) and len(value) > 100:
                    lines.append(f'- Suspect "{label}"\'s {field} was rewritten by the user')
                else:
                    lines.append(f'- Suspect "{label}"\'s {field} changed from "{old_val}" to "{value}"')
    return "\n".join(lines)


def apply_user_diff(ai_case: dict, user_diff: dict) -> None:
    for f in ("title", "type", "description"):
        if f in user_diff:
            ai_case[f] = user_diff[f]
    for key in ("officer", "partner"):
        cd = user_diff.get(f"_{key}")
        if cd and ai_case.get(key):
            for field, value in cd.items():
                ai_case[key][field] = value
    sd = user_diff.get("_suspects")
    if sd:
        for sid, fields in sd.items():
            suspect = next((s for s in ai_case.get("suspects", []) if s.get("id") == sid), None)
            if suspect:
                for field, value in fields.items():
                    suspect[field] = value


_NARRATIVE_PROPAGATION_FIELDS = {
    "isGuilty", "isDeceased", "motive", "secret", "alibi", "name", "role",
    "bio", "personality", "status", "physicalDescription", "professionalBackground", "witnessObservations",
}


def _requires_narrative_propagation(user_diff: dict) -> bool:
    if not user_diff:
        return False
    if any(k in user_diff for k in ("title", "type", "description")):
        return True
    for key in ("_officer", "_partner"):
        if user_diff.get(key):
            return True
    sd = user_diff.get("_suspects")
    if not sd:
        return False
    for fields in sd.values():
        for field in fields:
            if field in _NARRATIVE_PROPAGATION_FIELDS:
                return True
    return False


def strip_images_from_case(case_data: dict) -> tuple[dict, dict[str, str]]:
    image_map: dict[str, str] = {}
    clone = copy.deepcopy(case_data)
    for ev in clone.get("initialEvidence", []):
        if ev.get("imageUrl"):
            image_map[ev["id"]] = ev["imageUrl"]
            ev["imageUrl"] = "PLACEHOLDER"
    if clone.get("officer", {}).get("portraitUrl"):
        image_map["officer"] = clone["officer"]["portraitUrl"]
        clone["officer"]["portraitUrl"] = "PLACEHOLDER"
    if clone.get("heroImageUrl"):
        image_map["hero"] = clone["heroImageUrl"]
        clone["heroImageUrl"] = "PLACEHOLDER"
    for key in ("officer", "partner"):
        portraits = (clone.get(key) or {}).get("portraits")
        if portraits:
            for k in list(portraits):
                pid = f"{key}-p-{k}"
                image_map[pid] = portraits[k]
                portraits[k] = "PLACEHOLDER"
    for s in clone.get("suspects", []):
        if s.get("portraits"):
            for k in list(s["portraits"]):
                pid = f"{s['id']}-p-{k}"
                image_map[pid] = s["portraits"][k]
                s["portraits"][k] = "PLACEHOLDER"
        for ev in s.get("hiddenEvidence", []):
            if ev.get("imageUrl"):
                image_map[ev["id"]] = ev["imageUrl"]
                ev["imageUrl"] = "PLACEHOLDER"
    return clone, image_map


def hydrate_images_to_case(stripped: dict, image_map: dict[str, str]) -> dict:
    for ev in stripped.get("initialEvidence", []):
        if image_map.get(ev.get("id", "")):
            ev["imageUrl"] = image_map[ev["id"]]
        elif ev.get("imageUrl") == "PLACEHOLDER":
            del ev["imageUrl"]
    for key in ("officer", "partner"):
        portraits = (stripped.get(key) or {}).get("portraits")
        if portraits:
            for k in list(portraits):
                pid = f"{key}-p-{k}"
                if image_map.get(pid):
                    portraits[k] = image_map[pid]
    for s in stripped.get("suspects", []):
        if s.get("portraits"):
            for k in list(s["portraits"]):
                pid = f"{s['id']}-p-{k}"
                if image_map.get(pid):
                    s["portraits"][k] = image_map[pid]
        for ev in s.get("hiddenEvidence", []):
            if image_map.get(ev.get("id", "")):
                ev["imageUrl"] = image_map[ev["id"]]
            elif ev.get("imageUrl") == "PLACEHOLDER":
                del ev["imageUrl"]
    return stripped


# ---------- ENFORCE FUNCTIONS ----------

def enforce_relationships(case_data: dict) -> dict:
    suspects = case_data.get("suspects")
    if not suspects or not isinstance(suspects, list):
        print("[DEBUG] enforceRelationships: No suspects array found, skipping.")
        return case_data
    has_victim = case_data.get("hasVictim", True)
    victims = [x for x in suspects if x.get("isDeceased")]
    victim_names = [v["name"].strip() for v in victims if v.get("name")]
    alive_names = [s["name"].strip() for s in suspects if not s.get("isDeceased")]
    for s in suspects:
        if not s.get("relationships"):
            s["relationships"] = []
        cur = s["name"].strip()
        deceased = s.get("isDeceased")
        if has_victim and not deceased and len(victim_names) == 1:
            for r in s["relationships"]:
                if r["targetName"].strip() == victim_names[0]:
                    r["targetName"] = "The Victim"
        if has_victim and len(victim_names) > 1:
            for r in s["relationships"]:
                if r["targetName"].strip() == "The Victim":
                    r["targetName"] = victim_names[0]
        if not has_victim:
            s["relationships"] = [r for r in s["relationships"] if r["targetName"].strip() != "The Victim"]
        targets: list[str] = []
        if not deceased:
            if has_victim and len(victim_names) == 1:
                targets.append("The Victim")
            elif has_victim and len(victim_names) > 1:
                targets.extend(victim_names)
            targets.extend(n for n in alive_names if n != cur)
        else:
            targets.extend(o["name"].strip() for o in suspects if o["id"] != s["id"] and o.get("name"))
        for name in targets:
            has_rel = any(r["targetName"].strip() == name for r in s["relationships"])
            if not has_rel:
                is_vt = name == "The Victim" or (len(victim_names) > 1 and name in victim_names)
                s["relationships"].append({
                    "targetName": name,
                    "type": "Acquaintance",
                    "description": (
                        "I didn't know them personally, just another face in the crowd."
                        if is_vt else
                        "I've seen them around, but we don't talk much."
                    ),
                })
    return case_data


def enforce_timelines(case_data: dict) -> dict:
    def fix(timeline: list) -> list:
        if not timeline or not isinstance(timeline, list):
            return []
        for entry in timeline:
            if not entry.get("time") and not entry.get("activity"):
                continue
            if (not entry.get("time") or not entry["time"].strip()) and entry.get("activity"):
                act = entry["activity"].strip()
                m = re.match(r"^(\d{1,2}:\d{2}\s*(?:AM|PM|[A-Z]{2,4})?)\s*[:\-–—]\s*(.+)$", act, re.I)
                if m:
                    entry["time"] = m.group(1).strip()
                    entry["activity"] = m.group(2).strip()
                else:
                    entry["time"] = "??:?? ??"
            if entry.get("time"):
                ts = entry["time"].strip()
                if not entry.get("activity") or not entry["activity"].strip():
                    m = re.match(r"^(\d{1,2}:\d{2}\s*(?:AM|PM|[A-Z]{2,4})?)\s*[:\-–—]\s*(.+)$", ts, re.I)
                    if m:
                        entry["time"] = m.group(1).strip()
                        entry["activity"] = m.group(2).strip()
            if entry.get("activity") and entry.get("time") and entry["activity"].strip() == entry["time"].strip():
                entry["activity"] = ""
        return [e for e in timeline if (e.get("time") and e["time"].strip()) or (e.get("activity") and e["activity"].strip())]

    for s in case_data.get("suspects", []):
        s["timeline"] = fix(s.get("timeline", []))
    case_data["initialTimeline"] = fix(case_data.get("initialTimeline", []))
    return case_data


def _parse_time_12h(t: str):
    if not t:
        return None
    m = re.match(r"^(\d{1,2}):(\d{2})\s*(AM|PM)$", t.strip(), re.I)
    if not m:
        return None
    h = int(m.group(1))
    mins = int(m.group(2))
    period = m.group(3).upper()
    if period == "AM" and h == 12:
        h = 0
    if period == "PM" and h != 12:
        h += 12
    return {"hours": h, "minutes": mins}


def _format_time_from_minutes(mins: int) -> str:
    h = (mins // 60) % 24
    m = mins % 60
    period = "PM" if h >= 12 else "AM"
    if h == 0:
        h = 12
    elif h > 12:
        h -= 12
    return f"{h}:{m:02d} {period}"


def enforce_start_time_alignment(case_data: dict) -> dict:
    if not case_data.get("startTime"):
        return case_data
    try:
        from dateutil.parser import parse as dateparse
        start_date = dateparse(case_data["startTime"])
    except Exception:
        return case_data
    events = []
    for entry in case_data.get("initialTimeline", []):
        if (entry.get("dayOffset") or 0) == 0:
            p = _parse_time_12h(entry.get("time", ""))
            if p:
                events.append(p)
    for s in case_data.get("suspects", []):
        for entry in s.get("timeline", []):
            if (entry.get("dayOffset") or 0) == 0:
                p = _parse_time_12h(entry.get("time", ""))
                if p:
                    events.append(p)
    if not events:
        return case_data
    latest = max(events, key=lambda e: e["hours"] * 60 + e["minutes"])
    latest_mins = latest["hours"] * 60 + latest["minutes"]
    start_mins = start_date.hour * 60 + start_date.minute
    if start_mins <= latest_mins:
        new_mins = latest_mins + 30
        new_h = new_mins // 60
        new_m = new_mins % 60
        if new_h < 24:
            start_date = start_date.replace(hour=new_h, minute=new_m, second=0, microsecond=0)
        else:
            from datetime import timedelta
            start_date = start_date.replace(hour=new_h - 24, minute=new_m, second=0, microsecond=0) + timedelta(days=1)
        options_str = start_date.strftime("%A, %B %d, %Y") + " at " + start_date.strftime("%-I:%M %p")
        case_data["startTime"] = options_str
        print(f"[DEBUG] enforceStartTimeAlignment: Shifted startTime to {case_data['startTime']}")
    return case_data


def ensure_brought_in_entry(case_data: dict) -> dict:
    if not case_data.get("initialTimeline"):
        case_data["initialTimeline"] = []
    brought_in_patterns = re.compile(
        r"brought in|gathered.*for.*question|assembled.*for.*interview|arrive.*for.*question|called in.*for.*question", re.I
    )
    time_str = ""
    if case_data.get("startTime"):
        try:
            from dateutil.parser import parse as dateparse
            parsed = dateparse(case_data["startTime"])
            time_str = parsed.strftime("%-I:%M %p")
        except Exception:
            m = re.search(r"(\d{1,2}:\d{2}\s*(?:AM|PM))", case_data["startTime"], re.I)
            if m:
                time_str = m.group(1).strip()
    latest_minutes = -1
    for entry in case_data["initialTimeline"]:
        if (entry.get("dayOffset") or 0) != 0:
            continue
        if brought_in_patterns.search(entry.get("activity", "")):
            continue
        p = _parse_time_12h(entry.get("time", ""))
        if p:
            mins = p["hours"] * 60 + p["minutes"]
            if mins > latest_minutes:
                latest_minutes = mins
    brought_in_minutes = None
    p = _parse_time_12h(time_str)
    if p:
        brought_in_minutes = p["hours"] * 60 + p["minutes"]
    if latest_minutes >= 0:
        if brought_in_minutes is None or brought_in_minutes <= latest_minutes:
            time_str = _format_time_from_minutes(min(latest_minutes + 30, 23 * 60 + 59))
    if not time_str:
        time_str = _format_time_from_minutes(min(latest_minutes + 30, 23 * 60 + 59)) if latest_minutes >= 0 else "Late Evening"
    existing_idx = next((i for i, e in enumerate(case_data["initialTimeline"]) if brought_in_patterns.search(e.get("activity", ""))), None)
    if existing_idx is not None:
        entry = case_data["initialTimeline"][existing_idx]
        entry["day"] = "Today"
        entry["dayOffset"] = 0
        entry["time"] = time_str
        if existing_idx != len(case_data["initialTimeline"]) - 1:
            case_data["initialTimeline"].pop(existing_idx)
            case_data["initialTimeline"].append(entry)
    else:
        case_data["initialTimeline"].append({
            "time": time_str,
            "activity": "All persons of interest brought in for questioning by detective",
            "day": "Today",
            "dayOffset": 0,
        })
    return case_data


def enforce_suspect_schema(case_data: dict, original_case: dict | None = None) -> dict:
    if not case_data.get("suspects") or not isinstance(case_data["suspects"], list):
        return case_data
    orig_suspects = (original_case or {}).get("suspects", [])
    for s in case_data["suspects"]:
        orig = next((o for o in orig_suspects if o.get("id") == s.get("id")), {})
        string_fields = ["name", "gender", "bio", "role", "status", "personality", "secret", "motive",
                         "professionalBackground", "witnessObservations", "physicalDescription"]
        for f in string_fields:
            if not s.get(f) or not isinstance(s.get(f), str) or not s[f].strip():
                if orig.get(f) and isinstance(orig.get(f), str) and orig[f].strip():
                    s[f] = orig[f]
        if not s.get("status") or not isinstance(s.get("status"), str) or not s["status"].strip():
            if s.get("isDeceased"):
                s["status"] = "Deceased"
            else:
                agg = s.get("baseAggravation", 0) if isinstance(s.get("baseAggravation"), (int, float)) else 0
                if agg <= 25: s["status"] = "Cooperative"
                elif agg <= 50: s["status"] = "Guarded"
                elif agg <= 75: s["status"] = "Tense"
                else: s["status"] = "Hostile"
        if not isinstance(s.get("age"), (int, float)):
            s["age"] = orig.get("age", s.get("age"))
        if not isinstance(s.get("baseAggravation"), (int, float)):
            s["baseAggravation"] = orig.get("baseAggravation", s.get("baseAggravation"))
        if not isinstance(s.get("avatarSeed"), (int, float)):
            s["avatarSeed"] = orig.get("avatarSeed", _random.randint(0, 999999))
        if not isinstance(s.get("isGuilty"), bool):
            s["isGuilty"] = orig.get("isGuilty", False)
        if s.get("isDeceased") is None and orig.get("isDeceased") is not None:
            s["isDeceased"] = orig["isDeceased"]
        # Alibi
        if not s.get("alibi") or not isinstance(s.get("alibi"), dict):
            s["alibi"] = copy.deepcopy(orig["alibi"]) if orig.get("alibi") else {"statement": "", "isTrue": True, "location": "", "witnesses": []}
        else:
            if not s["alibi"].get("statement") and orig.get("alibi", {}).get("statement"):
                s["alibi"]["statement"] = orig["alibi"]["statement"]
            if not isinstance(s["alibi"].get("isTrue"), bool):
                s["alibi"]["isTrue"] = orig.get("alibi", {}).get("isTrue", True)
            if not s["alibi"].get("location") and orig.get("alibi", {}).get("location"):
                s["alibi"]["location"] = orig["alibi"]["location"]
            if not isinstance(s["alibi"].get("witnesses"), list):
                s["alibi"]["witnesses"] = orig.get("alibi", {}).get("witnesses", [])
            s["alibi"]["witnesses"] = [w for w in s["alibi"]["witnesses"] if isinstance(w, str) and w.strip()]
        # Timeline
        if not isinstance(s.get("timeline"), list):
            s["timeline"] = copy.deepcopy(orig["timeline"]) if orig.get("timeline") else []
        else:
            s["timeline"] = [e for e in s["timeline"] if e and isinstance(e, dict) and e.get("time") and isinstance(e["time"], str) and e["time"].strip()]
            for entry in s["timeline"]:
                if not entry.get("activity") or not isinstance(entry.get("activity"), str) or not entry["activity"].strip():
                    oe = next((o for o in orig.get("timeline", []) if o.get("time") == entry.get("time")), None)
                    if oe and oe.get("activity"):
                        entry["activity"] = oe["activity"]
            if not s["timeline"] and orig.get("timeline"):
                s["timeline"] = copy.deepcopy(orig["timeline"])
        # Relationships
        if not isinstance(s.get("relationships"), list):
            s["relationships"] = copy.deepcopy(orig["relationships"]) if orig.get("relationships") else []
        else:
            s["relationships"] = [r for r in s["relationships"] if r and isinstance(r, dict) and r.get("targetName") and isinstance(r["targetName"], str) and r["targetName"].strip()]
            for r in s["relationships"]:
                oe = next((o for o in orig.get("relationships", []) if o.get("targetName") == r.get("targetName")), None)
                if not r.get("type") or not isinstance(r.get("type"), str):
                    r["type"] = (oe or {}).get("type", "Acquaintance")
                if not r.get("description") or not isinstance(r.get("description"), str) or not r["description"].strip():
                    if oe and oe.get("description"):
                        r["description"] = oe["description"]
        # Known facts
        if not isinstance(s.get("knownFacts"), list):
            s["knownFacts"] = list(orig["knownFacts"]) if orig.get("knownFacts") else []
        else:
            s["knownFacts"] = [f for f in s["knownFacts"] if isinstance(f, str) and f.strip()]
            if not s["knownFacts"] and orig.get("knownFacts"):
                s["knownFacts"] = list(orig["knownFacts"])
        # Hidden evidence
        if not isinstance(s.get("hiddenEvidence"), list):
            s["hiddenEvidence"] = copy.deepcopy(orig["hiddenEvidence"]) if orig.get("hiddenEvidence") else []
        else:
            s["hiddenEvidence"] = [e for e in s["hiddenEvidence"] if e and isinstance(e, dict) and e.get("title") and isinstance(e["title"], str) and e["title"].strip()]
            for i, ev in enumerate(s["hiddenEvidence"]):
                if not ev.get("id") or not isinstance(ev.get("id"), str):
                    ev["id"] = f"he-{s['id']}-{i}"
                if not ev.get("description") or not isinstance(ev.get("description"), str):
                    oe = next((o for o in orig.get("hiddenEvidence", []) if o.get("id") == ev.get("id") or o.get("title") == ev.get("title")), None)
                    ev["description"] = (oe or {}).get("description", ev.get("title", ""))
                orig_ev = next((o for o in orig.get("hiddenEvidence", []) if o.get("id") == ev.get("id") or o.get("title") == ev.get("title")), None)
                if not isinstance(ev.get("location"), str) or not ev["location"].strip():
                    ev["location"] = (orig_ev or {}).get("location", "") if orig_ev and isinstance(orig_ev.get("location"), str) and orig_ev["location"].strip() else ""
                if s.get("isDeceased"):
                    if ev.get("discoveryContext") not in ("environment", "body"):
                        ev["discoveryContext"] = (orig_ev or {}).get("discoveryContext", "body") if orig_ev and orig_ev.get("discoveryContext") == "environment" else "body"
                    if ev.get("discoveryContext") == "environment" and not isinstance(ev.get("environmentIncludesBody"), bool):
                        ev["environmentIncludesBody"] = (orig_ev or {}).get("environmentIncludesBody", False) if orig_ev and isinstance(orig_ev.get("environmentIncludesBody"), bool) else False
        # Portraits & voice
        if not s.get("portraits") or not s["portraits"]:
            s["portraits"] = orig.get("portraits", {})
        if not s.get("voice"):
            s["voice"] = orig.get("voice")
        if not s.get("voiceAccent") or (isinstance(s.get("voiceAccent"), str) and not s["voiceAccent"].strip()):
            s["voiceAccent"] = orig.get("voiceAccent")
        if not s.get("voiceStyle"):
            s["voiceStyle"] = orig.get("voiceStyle")

    # Initial evidence
    if isinstance(case_data.get("initialEvidence"), list):
        orig_ev_list = (original_case or {}).get("initialEvidence", [])
        case_data["initialEvidence"] = [e for e in case_data["initialEvidence"] if e and isinstance(e, dict) and e.get("title") and isinstance(e["title"], str) and e["title"].strip()]
        for i, ev in enumerate(case_data["initialEvidence"]):
            if not ev.get("id") or not isinstance(ev.get("id"), str):
                ev["id"] = f"ie-{i}"
            if not ev.get("description") or not isinstance(ev.get("description"), str):
                oe = next((o for o in orig_ev_list if o.get("id") == ev.get("id") or o.get("title") == ev.get("title")), None)
                ev["description"] = (oe or {}).get("description", ev.get("title", ""))
            orig_ie = next((o for o in orig_ev_list if o.get("id") == ev.get("id") or o.get("title") == ev.get("title")), None)
            if not isinstance(ev.get("location"), str) or not ev["location"].strip():
                ev["location"] = (orig_ie or {}).get("location", "") if orig_ie and isinstance(orig_ie.get("location"), str) and orig_ie["location"].strip() else ""
    # Initial timeline
    if isinstance(case_data.get("initialTimeline"), list):
        orig_tl = (original_case or {}).get("initialTimeline", [])
        case_data["initialTimeline"] = [e for e in case_data["initialTimeline"] if e and isinstance(e, dict) and e.get("time") and isinstance(e["time"], str) and e["time"].strip()]
        for entry in case_data["initialTimeline"]:
            if not entry.get("activity") or not isinstance(entry.get("activity"), str) or not entry["activity"].strip():
                oe = next((o for o in orig_tl if o.get("time") == entry.get("time")), None)
                if oe and oe.get("activity"):
                    entry["activity"] = oe["activity"]
    print("[DEBUG] enforceSuspectSchema: Validated all suspects and case-level data")
    return case_data
