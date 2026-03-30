"""Prompt rules and JSON schemas for the case engine. Extracted to keep file sizes manageable."""
from __future__ import annotations

# All prompt rule strings are stored as a dict for easy composition in prompts.
PROMPT_RULES: dict[str, str] = {}

PROMPT_RULES["RELATIONSHIP_QUALITY"] = """**RELATIONSHIP QUALITY (CRITICAL):**
- Every suspect's 'relationships' array must have an entry for **each** deceased suspect (victim) and every other alive suspect.
- **Single deceased suspect:** use targetName exactly `The Victim` for that entry.
- **Multiple deceased suspects:** use each victim's **full name** as targetName (one relationship row per body) — never a single shared `The Victim` row when there is more than one isDeceased suspect.
- Each relationship 'description' field MUST be a rich, narrative description (2-3 sentences minimum).
- The 'description' MUST NOT simply repeat the 'type' label.
- Descriptions should reveal character personality and hint at dynamics relevant to the mystery."""

PROMPT_RULES["TIMELINE_FORMAT"] = """**TIMELINE FORMAT (CRITICAL):**
- Every timeline entry has FOUR separate fields: 'time', 'activity', 'day', and 'dayOffset'.
- The 'time' field must contain ONLY the timestamp (e.g. "8:00 PM", "11:30 AM"). Do NOT put the activity description in the time field.
- The 'activity' field must contain the description of what happened.
- **DAY LABELS — RELATIVE TO THE INVESTIGATION, NOT THE CRIME (CRITICAL):**
  dayOffset 0 = "Today" (the day of questioning — always the anchor point)
  dayOffset -1 = "Yesterday"; dayOffset -2 = "2 Days Ago"; etc.
- **12-HOUR FORMAT ONLY:** ALL times MUST use 12-hour AM/PM format. NEVER use 24-hour military time.
- WRONG: { time: "8:00 PM: Arrived at the lab", activity: "", day: "", dayOffset: 0 }
- CORRECT: { time: "8:00 PM", activity: "Arrived at the lab to begin shift", day: "Today", dayOffset: 0 }
- **MULTI-DAY TIMELINES:** Cases SHOULD span multiple days when it makes narrative sense."""

PROMPT_RULES["TIMELINE_SOURCE_OF_TRUTH"] = """**TIMELINE = SOURCE OF TRUTH FOR THE CASE (CRITICAL):**
- Each suspect's `timeline` (including **every victim** with `isDeceased: true`) is the **canonical, omniscient chronology** for that person.
- **Density minimums:** Living suspects: **At least 10** entries each. Victims: **At least 8** entries.
- **Guilty suspects (`isGuilty: true`):** The timeline MUST include a **clear, step-by-step sequence of the actual criminal conduct** with **tight timestamps**.
- **Reconciliation direction:** If other fields disagree with timelines, **prefer the timeline** and rewrite the other fields to match.
- **Alibi vs timeline:** `alibi.statement` is what the suspect **claims**; the `timeline` is what **actually** happened."""

PROMPT_RULES["TIMELINE_CONSISTENCY_AUDIT"] = """**TIMELINE — CONSISTENCY PASS (MANDATORY):**
- Apply **TIMELINE SOURCE OF TRUTH** to **every** suspect and victim. If any timeline is sparse or below minimum entries, **expand it**.
- **Guilty parties:** If the criminal sequence is missing or compressed, **rewrite the timeline** to spell out exactly what they did.
- **Victims:** Ensure their final hours mesh with guilty and witness timelines.
- **initialTimeline / startTime:** Must remain logically consistent with the full chronology."""

PROMPT_RULES["INITIAL_TIMELINE_SPOILER_PROTECTION"] = """**INITIAL TIMELINE — SPOILER PROTECTION (CRITICAL):**
- The 'initialTimeline' represents facts documented by PATROL OFFICERS before the case is handed to a detective.
- It must NEVER reveal or strongly imply who is guilty.
- **ABSOLUTELY FORBIDDEN:** Naming any guilty suspect in connection with suspicious activity, incriminating actions, or anything that makes the solution obvious.
- **ALLOWED:** When the crime was discovered, emergency services, estimated TOD, neutral environmental observations.
- **FINAL ENTRY — SUSPECTS BROUGHT IN (MANDATORY):** The LAST entry must always be about suspects being brought in for questioning with dayOffset 0 and day "Today"."""

PROMPT_RULES["NAMING_RULES"] = """**NAMING RULES:**
- **BANNED NAMES:** Jarek, Zara, Vane, Kael, Rian, Elias, Silas, Elara, Lyra, Orion, Nova, Zephyr, Thorne, Nyx, Jax, Kai, Luna, Raven, Shadow, Talon, Blaze.
- **PREFERRED STYLE:** Use grounded, realistic, mundane names (e.g. Frank, Martha, David, Chen, Rodriguez)."""

PROMPT_RULES["VICTIM_GENERATION"] = """**VICTIM GENERATION RULE:**
If the crime involves a death, YOU MUST GENERATE "THE VICTIM" AS A SUSPECT CARD AND SET hasVictim to true.
- Name: A realistic full name. Role: "The Victim". **isDeceased: true**.
- hiddenEvidence: 2-5 discoverable clues for crime scene examination. Mix body and environment items.
- If the crime does NOT involve a death (e.g. Theft, Fraud), set hasVictim to false."""

PROMPT_RULES["SUSPECT_PROFILES"] = """**SUSPECT PROFILE REQUIREMENTS:**
- GENDER: Explicitly state Male, Female, or Non-binary.
- STATUS: A short label describing INITIAL DEMEANOR. Must NOT reveal information about guilt. Must match personality + baseAggravation.
- BIO: PUBLIC PROFILE ONLY — SPOILER-FREE.
- SECRET: The hidden truth they are trying to hide.
- RELATIONSHIPS: MANDATORY entries for all other suspects and victims.
- KNOWN FACTS: 2-3 specific facts about the crime.
- TIMELINE: Canonical chronology. Minimum 10 entries for living, 8 for victims.
- hiddenEvidence: At least 2 items for each living suspect."""

PROMPT_RULES["DATA_COMPLETENESS"] = """**DATA COMPLETENESS (CRITICAL):**
- You MUST populate alibi, motive, relationships, knownFacts, timeline, professionalBackground, and witnessObservations for EVERY suspect.
- Do NOT return null or empty strings/arrays for required fields.
- Timelines: Living suspects >= 10 entries; victims >= 8 entries; guilty must include detailed criminal sequence.
- initialEvidence MUST list at least 3 items. Every living suspect MUST have at least 2 hiddenEvidence items.
- Every evidence item MUST include a non-empty 'location' string."""

PROMPT_RULES["OUTPUT_FORMAT_WITH_REPORT"] = """**OUTPUT FORMAT:**
- You must return a JSON object with two fields:
  - 'updatedCase': The complete CaseData object.
  - 'report': A structured object containing 'issuesFound', 'changesMade' (array of {description, evidenceId}), and 'conclusion'."""

PROMPT_RULES["BIO_SPOILER_PROTECTION"] = """**BIO / PUBLIC PROFILE — SPOILER PROTECTION (CRITICAL):**
- The 'bio' field is displayed prominently on the BACK of each suspect's card. It must read like a PUBLIC DOSSIER.
- **ABSOLUTELY FORBIDDEN in bio:** Any statement that the suspect committed the crime, explicit references to guilt, or descriptions of motive phrased as fact.
- **REQUIRED in bio:** Public background, known connection to victim/location, general personality traits.
- This rule applies to ALL suspects — bios must be indistinguishable in tone between guilty and innocent."""

PROMPT_RULES["START_TIME_ALIGNMENT"] = """**START TIME — TIMELINE ALIGNMENT (CRITICAL):**
- The 'startTime' MUST be AFTER all events on the day of questioning (dayOffset: 0).
- Cross-reference the latest initialTimeline entry on today. The startTime MUST be at least 30 minutes after.
- **ERA / SETTING AWARENESS:** The startTime MUST match the time period and setting of the case.
- When outputting startTime, prefer a fully spelled out human-readable format."""

PROMPT_RULES["EVIDENCE_DESCRIPTION_STYLE"] = """**WRITING STYLE RULES (CRITICAL — TWO RULES):**
**RULE 1 — EVIDENCE DESCRIPTIONS:** NEVER use pronouns. ALWAYS use FULL NAME of the person.
**RULE 2 — ALL OTHER FIELDS:** Use natural prose with pronouns after first mention of a name."""

PROMPT_RULES["EVIDENCE_COUNTS"] = """**EVIDENCE COUNTS (MANDATORY):**
- **initialEvidence:** At least 3 distinct items.
- **hiddenEvidence:** Each suspect at least 2 entries. Victim: 2-5 clues."""

PROMPT_RULES["EVIDENCE_LOCATION"] = """**EVIDENCE 'location' FIELD (CRITICAL):**
- Every evidence item MUST include a non-empty string 'location'.
- **Victim hiddenEvidence:** Use 'discoveryContext' ("body" or "environment") and 'environmentIncludesBody' boolean.
- **description** states what the object is; **location** states only where it sits."""

PROMPT_RULES["VOICE_ACCENT"] = """**VOICE ACCENT (REQUIRED FOR ALL CHARACTERS):**
- Every suspect, officer, and partner MUST have a 'voiceAccent' field.
- A short, natural-language accent description (e.g. "Mexican", "British", "Southern American").
- Must be appropriate to background, nationality, setting, and case theme.
- Do NOT default to "General American" unless the character is clearly American."""


# ---------- JSON SCHEMAS ----------

CASE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "id": {"type": "STRING"}, "title": {"type": "STRING"}, "type": {"type": "STRING"},
        "description": {"type": "STRING"}, "startTime": {"type": "STRING"}, "hasVictim": {"type": "BOOLEAN"},
        "officer": {"type": "OBJECT", "properties": {
            "id": {"type": "STRING"}, "name": {"type": "STRING"}, "role": {"type": "STRING"},
            "gender": {"type": "STRING"}, "voiceAccent": {"type": "STRING"},
        }},
        "partner": {"type": "OBJECT", "properties": {
            "id": {"type": "STRING"}, "name": {"type": "STRING"}, "role": {"type": "STRING"},
            "gender": {"type": "STRING"}, "voiceAccent": {"type": "STRING"},
        }},
        "initialEvidence": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
            "id": {"type": "STRING"}, "title": {"type": "STRING"}, "location": {"type": "STRING"},
            "description": {"type": "STRING"}, "discoveryContext": {"type": "STRING"},
            "environmentIncludesBody": {"type": "BOOLEAN"},
        }, "required": ["id", "title", "location", "description"]}},
        "initialTimeline": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
            "time": {"type": "STRING"}, "activity": {"type": "STRING"},
            "day": {"type": "STRING"}, "dayOffset": {"type": "NUMBER"},
        }, "required": ["time", "activity", "day", "dayOffset"]}},
        "suspects": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
            "id": {"type": "STRING"}, "name": {"type": "STRING"}, "gender": {"type": "STRING"},
            "age": {"type": "NUMBER"}, "role": {"type": "STRING"}, "status": {"type": "STRING"},
            "bio": {"type": "STRING"}, "personality": {"type": "STRING"}, "secret": {"type": "STRING"},
            "physicalDescription": {"type": "STRING"}, "isGuilty": {"type": "BOOLEAN"},
            "isDeceased": {"type": "BOOLEAN"}, "baseAggravation": {"type": "NUMBER"},
            "motive": {"type": "STRING"}, "voiceAccent": {"type": "STRING"},
            "alibi": {"type": "OBJECT", "properties": {
                "statement": {"type": "STRING"}, "isTrue": {"type": "BOOLEAN"},
                "location": {"type": "STRING"}, "witnesses": {"type": "ARRAY", "items": {"type": "STRING"}},
            }, "required": ["statement", "isTrue", "location", "witnesses"]},
            "relationships": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
                "targetName": {"type": "STRING"}, "type": {"type": "STRING"}, "description": {"type": "STRING"},
            }, "required": ["targetName", "type", "description"]}},
            "timeline": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
                "time": {"type": "STRING"}, "activity": {"type": "STRING"},
                "day": {"type": "STRING"}, "dayOffset": {"type": "NUMBER"},
            }, "required": ["time", "activity", "day", "dayOffset"]}},
            "knownFacts": {"type": "ARRAY", "items": {"type": "STRING"}},
            "professionalBackground": {"type": "STRING"}, "witnessObservations": {"type": "STRING"},
            "hiddenEvidence": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
                "id": {"type": "STRING"}, "title": {"type": "STRING"}, "location": {"type": "STRING"},
                "description": {"type": "STRING"}, "discoveryContext": {"type": "STRING"},
                "environmentIncludesBody": {"type": "BOOLEAN"},
            }, "required": ["id", "title", "location", "description"]}},
        }, "required": ["id", "name", "gender", "age", "role", "status", "bio", "personality",
            "secret", "physicalDescription", "isGuilty", "isDeceased", "baseAggravation",
            "motive", "alibi", "relationships", "timeline", "knownFacts",
            "professionalBackground", "witnessObservations", "hiddenEvidence"]}},
    },
    "required": ["id", "title", "type", "description", "officer", "partner", "initialEvidence", "suspects"],
}

REPORT_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "issuesFound": {"type": "STRING"},
        "changesMade": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
            "description": {"type": "STRING"}, "evidenceId": {"type": "STRING"},
        }, "required": ["description"]}},
        "conclusion": {"type": "STRING"},
    },
    "required": ["issuesFound", "changesMade", "conclusion"],
}

# Generation-specific schema (slightly different required fields)
CASE_GENERATION_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "id": {"type": "STRING"}, "title": {"type": "STRING"}, "type": {"type": "STRING"},
        "description": {"type": "STRING"}, "startTime": {"type": "STRING"}, "hasVictim": {"type": "BOOLEAN"},
        "officer": {"type": "OBJECT", "properties": {
            "id": {"type": "STRING"}, "name": {"type": "STRING"}, "gender": {"type": "STRING"},
            "role": {"type": "STRING"}, "personality": {"type": "STRING"}, "voiceAccent": {"type": "STRING"},
        }, "required": ["name", "gender", "role", "personality", "voiceAccent"]},
        "partner": {"type": "OBJECT", "properties": {
            "id": {"type": "STRING"}, "name": {"type": "STRING"}, "gender": {"type": "STRING"},
            "role": {"type": "STRING"}, "personality": {"type": "STRING"}, "voiceAccent": {"type": "STRING"},
        }, "required": ["name", "gender", "role", "personality", "voiceAccent"]},
        "initialEvidence": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
            "id": {"type": "STRING"}, "title": {"type": "STRING"}, "location": {"type": "STRING"},
            "description": {"type": "STRING"}, "discoveryContext": {"type": "STRING"},
            "environmentIncludesBody": {"type": "BOOLEAN"},
        }, "required": ["title", "location", "description"]}},
        "initialTimeline": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
            "time": {"type": "STRING"}, "activity": {"type": "STRING"},
            "day": {"type": "STRING"}, "dayOffset": {"type": "NUMBER"},
        }, "required": ["time", "activity", "day", "dayOffset"]}},
        "suspects": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
            "id": {"type": "STRING"}, "name": {"type": "STRING"}, "gender": {"type": "STRING"},
            "age": {"type": "NUMBER"}, "role": {"type": "STRING"}, "status": {"type": "STRING"},
            "bio": {"type": "STRING"}, "personality": {"type": "STRING"}, "secret": {"type": "STRING"},
            "physicalDescription": {"type": "STRING"}, "professionalBackground": {"type": "STRING"},
            "isGuilty": {"type": "BOOLEAN"}, "isDeceased": {"type": "BOOLEAN"},
            "baseAggravation": {"type": "NUMBER"}, "avatarSeed": {"type": "NUMBER"},
            "motive": {"type": "STRING"}, "witnessObservations": {"type": "STRING"},
            "voiceAccent": {"type": "STRING"},
            "alibi": {"type": "OBJECT", "properties": {
                "statement": {"type": "STRING"}, "isTrue": {"type": "BOOLEAN"},
                "location": {"type": "STRING"}, "witnesses": {"type": "ARRAY", "items": {"type": "STRING"}},
            }, "required": ["statement", "isTrue", "location", "witnesses"]},
            "relationships": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
                "targetName": {"type": "STRING"}, "type": {"type": "STRING"}, "description": {"type": "STRING"},
            }, "required": ["targetName", "type", "description"]}},
            "timeline": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
                "time": {"type": "STRING"}, "activity": {"type": "STRING"},
                "day": {"type": "STRING"}, "dayOffset": {"type": "NUMBER"},
            }, "required": ["time", "activity", "day", "dayOffset"]}},
            "knownFacts": {"type": "ARRAY", "items": {"type": "STRING"}},
            "hiddenEvidence": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
                "id": {"type": "STRING"}, "title": {"type": "STRING"}, "location": {"type": "STRING"},
                "description": {"type": "STRING"}, "discoveryContext": {"type": "STRING"},
                "environmentIncludesBody": {"type": "BOOLEAN"},
            }, "required": ["title", "location", "description"]}},
        }, "required": ["name", "gender", "role", "status", "bio", "personality", "secret",
            "isGuilty", "baseAggravation", "motive", "alibi", "relationships", "knownFacts",
            "hiddenEvidence", "timeline", "professionalBackground", "witnessObservations", "voiceAccent"]}},
    },
    "required": ["title", "description", "initialEvidence", "suspects", "officer", "partner"],
}
