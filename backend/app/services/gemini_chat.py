"""
Suspect interrogation chat, officer/chief chat, partner interventions, bad cop hints, and case summaries.
Port of geminiChat.ts.
"""
from __future__ import annotations
import json
import re
from typing import Any

from .gemini_client import ai
from .gemini_models import GEMINI_MODELS, generate_with_text_model
from .evidence_reveal_mapping import (
    EvidenceTitleMatch,
    normalize_revealed_evidence_titles,
    strip_revealed_evidence_metadata,
)


# ── System prompt builder ──────────────────────────────────────────────

def _build_suspect_system_prompt(
    suspect: dict,
    case_data: dict,
    game_state: dict,
) -> str:
    """Build the system prompt for suspect interrogation."""
    suspects = case_data.get("suspects", [])
    victim = next((s for s in suspects if s.get("isDeceased")), None)
    victim_name = victim["name"] if victim else "the victim"

    # Gather all hidden evidence across suspects that hasn't been revealed yet
    revealed = set(game_state.get("revealedEvidence", []))
    all_hidden = []
    for s in suspects:
        for ev in s.get("hiddenEvidence", []):
            if ev.get("title") not in revealed:
                all_hidden.append(ev)

    # Build suspect's own hidden evidence list
    own_hidden = suspect.get("hiddenEvidence", [])
    unrevealed_own = [ev for ev in own_hidden if ev.get("title") not in revealed]

    # Relationships
    relationships_text = ""
    for rel in suspect.get("relationships", []):
        relationships_text += f"\n- {rel.get('targetName', '?')}: {rel.get('description', '')} (type: {rel.get('type', 'Unknown')})"

    # Known facts
    known_facts_text = "\n".join(f"- {f}" for f in suspect.get("knownFacts", []))

    # Timeline
    timeline_text = ""
    for entry in suspect.get("timeline", []):
        day_label = entry.get("day", "")
        timeline_text += f"\n- [{day_label}] {entry.get('time', '?')}: {entry.get('activity', '')}"

    # Other suspects info for cross-referencing
    other_suspects_text = ""
    for s in suspects:
        if s.get("id") == suspect.get("id") or s.get("isDeceased"):
            continue
        other_suspects_text += f"\n\n--- {s['name']} ({s.get('role', '')}) ---\nBio: {s.get('bio', '')}\nAlibi: {s.get('alibi', {}).get('statement', 'No alibi given.')}\nRelationship to victim: "
        victim_rel = next((r for r in s.get("relationships", []) if r.get("targetName") in ("The Victim", victim_name)), None)
        other_suspects_text += victim_rel.get("description", "Unknown") if victim_rel else "Unknown"

    # Aggravation level description
    aggravation = game_state.get("aggravation", suspect.get("baseAggravation", 0))
    if aggravation <= 25:
        agg_desc = "calm and cooperative"
    elif aggravation <= 50:
        agg_desc = "slightly guarded"
    elif aggravation <= 75:
        agg_desc = "visibly agitated and defensive"
    else:
        agg_desc = "hostile and on the verge of refusing to talk"

    # Evidence reveal instructions
    evidence_reveal_section = ""
    if unrevealed_own:
        ev_list = ""
        for ev in unrevealed_own:
            ev_list += f'\n  * "{ev.get("title", "")}" — {ev.get("description", "")} (hidden: {ev.get("location", "?")})'
        evidence_reveal_section = f"""
**HIDDEN EVIDENCE YOU POSSESS (UNREVEALED):**
You have the following hidden items/knowledge that the detective has NOT yet discovered:{ev_list}

**EVIDENCE REVEAL RULES:**
- You may reveal evidence when the detective's questions or actions make discovery plausible.
- Revealing requires either: (a) the detective asks about the right topic/location, (b) the detective performs a physical action that would uncover it, or (c) you slip up under pressure.
- When revealing, add the EXACT title to your revealedEvidence array.
- Higher aggravation = less likely to voluntarily reveal. Lower aggravation = might slip up more easily.
- Physical actions (searching pockets, checking belongings) can force reveals regardless of aggravation.
"""

    is_guilty = suspect.get("isGuilty", False)
    guilt_section = f"""
**YOUR GUILT STATUS: {"GUILTY" if is_guilty else "INNOCENT"}**
{"You committed the crime. Your secret: " + suspect.get('secret', '') + ". You must protect this secret while staying believable. You may lie, deflect, or become hostile, but total silence is suspicious. If cornered with undeniable evidence, you may partially admit but try to minimize your involvement." if is_guilty else "You are innocent. You do not know who committed the crime. You should be generally cooperative but may have your own secrets or reasons to be defensive. Your secret: " + suspect.get('secret', '')}
"""

    case_desc = case_data.get("description", "")
    case_type = case_data.get("type", "Mystery")

    return f"""You are {suspect['name']}, a suspect in a {case_type} investigation.
You are being interrogated by a detective.

**YOUR PROFILE:**
- Name: {suspect['name']}
- Role: {suspect.get('role', 'Unknown')}
- Gender: {suspect.get('gender', 'Unknown')}
- Age: {suspect.get('age', 'Unknown')}
- Personality: {suspect.get('personality', '')}
- Professional Background: {suspect.get('professionalBackground', '')}
- Physical Description: {suspect.get('physicalDescription', '')}

**THE CASE:**
{case_desc}

**YOUR BIO (public knowledge):**
{suspect.get('bio', '')}

{guilt_section}

**YOUR ALIBI:**
Statement: {suspect.get('alibi', {}).get('statement', 'No alibi.')}
Is True: {suspect.get('alibi', {}).get('isTrue', True)}
Location: {suspect.get('alibi', {}).get('location', 'Unknown')}
Witnesses: {', '.join(suspect.get('alibi', {}).get('witnesses', [])) or 'None'}

**YOUR MOTIVE (why you might be suspected):**
{suspect.get('motive', 'Unknown')}

**YOUR RELATIONSHIPS:**{relationships_text}

**YOUR KNOWN FACTS ABOUT THE CRIME:**
{known_facts_text}

**YOUR TIMELINE:**{timeline_text}

**WHAT YOU SAW/HEARD:**
{suspect.get('witnessObservations', 'Nothing notable.')}

{evidence_reveal_section}

**OTHER SUSPECTS (for cross-referencing):**{other_suspects_text}

**CURRENT EMOTIONAL STATE:**
Your aggravation level is {aggravation}/100 ({agg_desc}).
Adjust your responses accordingly — more aggravated = shorter, more hostile, less cooperative.

**RESPONSE RULES:**
1. Stay in character at ALL times. You ARE this person.
2. Respond naturally as this character would in an interrogation.
3. Do NOT break the fourth wall or reference game mechanics.
4. Keep responses concise but in-character (2-4 sentences typical, more if revealing important info).
5. React to the detective's tone — aggressive questioning may make you defensive or hostile.
6. You may reference other suspects by name if relevant.
7. If the detective mentions evidence you know about, react appropriately.
8. If asked about something you genuinely don't know, say so in character.
9. If the detective performs a physical action (searching you, checking your belongings), react and potentially reveal evidence.
10. NEVER directly state "I am guilty" or "I am innocent" — show through behavior.
11. If your aggravation is very high (75+), you may threaten to stop talking or demand a lawyer.

**OUTPUT FORMAT:**
Return a JSON object with these fields:
- "dialogue": Your spoken response (string)
- "emotion": One of NEUTRAL, ANGRY, SAD, NERVOUS, HAPPY, SURPRISED, SLY, CONTENT, DEFENSIVE, ARROGANT
- "aggravationDelta": A number from -10 to +15 representing how much this exchange changes your aggravation
- "revealedEvidence": An array of evidence TITLES that you reveal in this response (empty array if none). Use EXACT titles from your hidden evidence list. Only include items you are revealing NOW, not previously revealed items.
- "timelineReferences": An array of objects with "time" and "activity" for any specific timeline events you reference in your response (empty array if none)
"""


async def get_suspect_response(
    suspect: dict,
    case_data: dict,
    game_state: dict,
    chat_history: list[dict],
    user_message: str,
) -> dict:
    """Generate suspect response during interrogation."""
    system_prompt = _build_suspect_system_prompt(suspect, case_data, game_state)

    # Build conversation history for context
    contents: list[Any] = []
    for msg in chat_history[-20:]:  # Keep last 20 messages for context
        role = "user" if msg.get("role") == "user" else "model"
        contents.append({"role": role, "parts": [{"text": msg.get("text", "")}]})

    # Add current user message
    contents.append({"role": "user", "parts": [{"text": user_message}]})

    from google.genai import types

    async def try_generate(model: str):
        return await ai.aio.models.generate_content(
            model=model,
            contents=contents,
            config={
                "system_instruction": system_prompt,
                "response_mime_type": "application/json",
                "response_schema": {
                    "type": "OBJECT",
                    "properties": {
                        "dialogue": {"type": "STRING"},
                        "emotion": {"type": "STRING"},
                        "aggravationDelta": {"type": "NUMBER"},
                        "revealedEvidence": {"type": "ARRAY", "items": {"type": "STRING"}},
                        "timelineReferences": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
                                "properties": {
                                    "time": {"type": "STRING"},
                                    "activity": {"type": "STRING"},
                                },
                            },
                        },
                    },
                    "required": ["dialogue", "emotion", "aggravationDelta", "revealedEvidence"],
                },
            },
        )

    result = await generate_with_text_model(GEMINI_MODELS["CHAT"], try_generate, "getSuspectResponse")

    text = result.text
    if not text:
        raise RuntimeError("No response from AI")

    parsed = json.loads(text)

    # Normalize revealed evidence titles
    raw_evidence = parsed.get("revealedEvidence", [])
    if raw_evidence:
        revealed_set = set(game_state.get("revealedEvidence", []))
        own_hidden = suspect.get("hiddenEvidence", [])
        unrevealed = [
            EvidenceTitleMatch(id=ev.get("id", ""), title=ev.get("title", ""), description=ev.get("description"))
            for ev in own_hidden
            if ev.get("title") not in revealed_set
        ]
        normalized = normalize_revealed_evidence_titles(
            [strip_revealed_evidence_metadata(line) if isinstance(line, str) else line for line in raw_evidence],
            unrevealed,
        )
        parsed["revealedEvidence"] = normalized

    return parsed


async def get_case_summary(
    case_data: dict,
    game_state: dict,
    accusation: dict,
) -> dict:
    """Generate end-of-game narrative summary."""
    suspects = case_data.get("suspects", [])
    guilty_names = [s["name"] for s in suspects if s.get("isGuilty")]
    accused_ids = accusation.get("accusedIds", [])
    accused_names = [s["name"] for s in suspects if s.get("id") in accused_ids]

    correct = set(s["id"] for s in suspects if s.get("isGuilty")) == set(accused_ids)

    prompt = f"""Generate a dramatic case summary for a detective mystery game.

CASE: {case_data.get('title', '')}
Type: {case_data.get('type', '')}
Description: {case_data.get('description', '')}

THE TRUTH:
The guilty party was: {', '.join(guilty_names)}

PLAYER'S ACCUSATION:
The player accused: {', '.join(accused_names) if accused_names else 'Nobody (gave up)'}
Result: {'CORRECT — the player solved the case!' if correct else 'INCORRECT — the player got it wrong.'}

INVESTIGATION STATS:
- Evidence found: {game_state.get('evidenceFound', 0)}
- Suspects interrogated: {game_state.get('suspectsSpoken', 0)}
- Timeline entries discovered: {game_state.get('timelineFound', 0)}

Write a 3-4 paragraph dramatic narrative summarizing the case resolution. If the player was correct, celebrate their detective work. If incorrect, reveal the truth dramatically.

Return as JSON:
- "summary": The narrative text (string, can include line breaks)
- "headline": A newspaper-style headline (short, punchy)
"""

    async def try_generate(model: str):
        return await ai.aio.models.generate_content(
            model=model,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": {
                    "type": "OBJECT",
                    "properties": {
                        "summary": {"type": "STRING"},
                        "headline": {"type": "STRING"},
                    },
                    "required": ["summary", "headline"],
                },
            },
        )

    result = await generate_with_text_model(GEMINI_MODELS["CHAT"], try_generate, "getCaseSummary")
    text = result.text
    if not text:
        raise RuntimeError("No response from AI")
    return json.loads(text)


async def get_officer_response(
    case_data: dict,
    game_state: dict,
    chat_history: list[dict],
    user_message: str,
) -> dict:
    """Generate officer/chief response for the radio channel."""
    officer = case_data.get("officer", {})
    suspects = case_data.get("suspects", [])

    suspect_summary = ""
    for s in suspects:
        if s.get("isDeceased"):
            continue
        suspect_summary += f"\n- {s['name']} ({s.get('role', '')}): {s.get('status', '')}. Motive: {s.get('motive', 'Unknown')}"

    system_prompt = f"""You are {officer.get('name', 'Chief')}, the {officer.get('role', 'Police Chief')} overseeing this investigation.
A detective is radioing in for guidance. Provide helpful hints without directly revealing who is guilty.

THE CASE: {case_data.get('title', '')}
{case_data.get('description', '')}

SUSPECTS:{suspect_summary}

You know the case details but must let the detective figure it out. Give nudges, suggest lines of questioning, or point out overlooked evidence. Keep responses concise (2-3 sentences). Stay in character as {officer.get('name', 'the Chief')}.

Return JSON: {{ "dialogue": "your response", "emotion": "NEUTRAL" }}
"""

    contents: list[Any] = []
    for msg in chat_history[-10:]:
        role = "user" if msg.get("role") == "user" else "model"
        contents.append({"role": role, "parts": [{"text": msg.get("text", "")}]})
    contents.append({"role": "user", "parts": [{"text": user_message}]})

    async def try_generate(model: str):
        return await ai.aio.models.generate_content(
            model=model,
            contents=contents,
            config={
                "system_instruction": system_prompt,
                "response_mime_type": "application/json",
                "response_schema": {
                    "type": "OBJECT",
                    "properties": {
                        "dialogue": {"type": "STRING"},
                        "emotion": {"type": "STRING"},
                    },
                    "required": ["dialogue", "emotion"],
                },
            },
        )

    result = await generate_with_text_model(GEMINI_MODELS["CHAT"], try_generate, "getOfficerResponse")
    text = result.text
    if not text:
        raise RuntimeError("No response from AI")
    return json.loads(text)


async def get_partner_intervention(
    case_data: dict,
    suspect: dict,
    game_state: dict,
    chat_history: list[dict],
    intervention_type: str,
) -> dict:
    """Generate partner good cop / bad cop intervention."""
    partner = case_data.get("partner", {})
    aggravation = game_state.get("aggravation", suspect.get("baseAggravation", 0))

    if intervention_type == "good":
        intervention_instruction = f"""You are {partner.get('name', 'Your partner')}, the detective's partner, intervening as GOOD COP.
Your goal is to de-escalate the suspect ({suspect['name']}) and build rapport. Be empathetic, understanding, and suggest you're on their side.
This should REDUCE the suspect's aggravation by 15-25 points.
The suspect's current aggravation is {aggravation}/100."""
    else:
        intervention_instruction = f"""You are {partner.get('name', 'Your partner')}, the detective's partner, intervening as BAD COP.
Your goal is to pressure and intimidate the suspect ({suspect['name']}). Be aggressive, threatening, and make them feel cornered.
This should INCREASE the suspect's aggravation by 10-20 points BUT may cause them to slip up and reveal information.
The suspect's current aggravation is {aggravation}/100."""

    recent_chat = "\n".join(
        f"{'Detective' if m.get('role') == 'user' else suspect['name']}: {m.get('text', '')}"
        for m in chat_history[-6:]
    )

    prompt = f"""{intervention_instruction}

CASE: {case_data.get('title', '')}
SUSPECT: {suspect['name']} — {suspect.get('personality', '')}

Recent conversation:
{recent_chat}

Write a dramatic 2-3 sentence intervention. Stay in character as the partner.

Return JSON:
- "dialogue": Your intervention (string)
- "emotion": Partner's emotion (NEUTRAL, ANGRY, HAPPY, etc.)
- "aggravationDelta": How much this changes the suspect's aggravation (negative for good cop, positive for bad cop)
"""

    async def try_generate(model: str):
        return await ai.aio.models.generate_content(
            model=model,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": {
                    "type": "OBJECT",
                    "properties": {
                        "dialogue": {"type": "STRING"},
                        "emotion": {"type": "STRING"},
                        "aggravationDelta": {"type": "NUMBER"},
                    },
                    "required": ["dialogue", "emotion", "aggravationDelta"],
                },
            },
        )

    result = await generate_with_text_model(GEMINI_MODELS["CHAT"], try_generate, "getPartnerIntervention")
    text = result.text
    if not text:
        raise RuntimeError("No response from AI")
    return json.loads(text)


async def get_bad_cop_hint(
    case_data: dict,
    suspect: dict,
    game_state: dict,
    chat_history: list[dict],
) -> dict:
    """Generate a tactical hint after bad cop intervention."""
    partner = case_data.get("partner", {})

    recent_chat = "\n".join(
        f"{'Detective' if m.get('role') == 'user' else suspect['name']}: {m.get('text', '')}"
        for m in chat_history[-6:]
    )

    prompt = f"""You are {partner.get('name', 'Your partner')}, whispering a tactical suggestion to your detective partner after performing a bad cop intervention on {suspect['name']}.

Based on the recent conversation, suggest something specific the detective should ask about or press on. Be brief (1-2 sentences).

CASE: {case_data.get('title', '')}
SUSPECT: {suspect['name']}

Recent conversation:
{recent_chat}

Return JSON:
- "hint": Your whispered suggestion (string)
"""

    async def try_generate(model: str):
        return await ai.aio.models.generate_content(
            model=model,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": {
                    "type": "OBJECT",
                    "properties": {
                        "hint": {"type": "STRING"},
                    },
                    "required": ["hint"],
                },
            },
        )

    result = await generate_with_text_model(GEMINI_MODELS["CHAT"], try_generate, "getBadCopHint")
    text = result.text
    if not text:
        raise RuntimeError("No response from AI")
    return json.loads(text)
