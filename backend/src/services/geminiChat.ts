import { Type } from "@google/genai";
import { ai } from "./geminiClient.js";
import { GEMINI_MODELS, generateWithTextModel } from "./geminiModels.js";
import { normalizeRevealedEvidenceTitles } from "./evidenceRevealMapping.js";

/**
 * All chat-related Gemini service functions.
 * These are moved verbatim from frontend/services/geminiChat.ts.
 * The prompt engineering and response schemas are identical.
 */

/** Strip internal victim-clue metadata from model output (UI shows title only). */
function stripRevealedEvidenceLine(line: string): string {
  const s = line.trim();
  const idx = s.search(/\s*\|\s*DISCOVERY_ZONE\b/i);
  return idx >= 0 ? s.slice(0, idx).trim() : s;
}

// --- Types (subset of frontend types needed here) ---
interface Evidence {
  id: string;
  title: string;
  location?: string;
  description: string;
  imageUrl?: string;
  discoveryContext?: 'body' | 'environment';
  environmentIncludesBody?: boolean;
}
interface Alibi { statement: string; isTrue: boolean; location: string; witnesses: string[]; }
interface Relationship { targetName: string; type: string; description: string; }
interface TimelineEvent { time: string; activity: string; day: string; dayOffset: number; }
interface SupportCharacter { id: string; name: string; gender: string; role: string; personality: string; avatarSeed: number; portraits?: Record<string, string>; voice?: string; }
interface Suspect {
  id: string; name: string; gender: string; age: number; bio: string; role: string;
  status: string; personality: string; avatarSeed: number; baseAggravation: number;
  isGuilty: boolean; secret: string; physicalDescription?: string; isDeceased?: boolean;
  alibi: Alibi; motive: string; relationships: Relationship[]; timeline: TimelineEvent[];
  knownFacts: string[]; professionalBackground: string; witnessObservations: string;
  hiddenEvidence: Evidence[]; portraits?: Record<string, string>; voice?: string;
}
interface CaseData {
  id: string; title: string; type: string; description: string; difficulty: string;
  suspects: Suspect[]; initialEvidence: Evidence[]; initialTimeline: TimelineEvent[];
  officer: SupportCharacter; partner: SupportCharacter; startTime?: string;
  isUploaded?: boolean; isFeatured?: boolean; partnerCharges?: number;
  heroImageUrl?: string; version?: number; authorId?: string; authorDisplayName?: string;
  createdAt?: number; updatedAt?: number; hasVictim?: boolean;
}
interface ChatMessage {
  sender: 'player' | 'suspect' | 'officer' | 'partner' | 'system';
  text: string; timestamp: string; type?: 'talk' | 'action';
  attachment?: string | null; evidence?: string[] | null;
  isEvidenceCollected?: boolean[]; audioUrl?: string | null;
}

/** Timeline rows the player has confirmed — partner may treat as known facts only. */
interface PartnerTimelineKnown {
  time: string;
  statement: string;
  day: string;
  suspectName?: string;
}

function formatPartnerKnownEvidence(ev: Evidence[]): string {
  if (!ev || ev.length === 0) return 'None yet.';
  return ev.map(e => `"${e.title}": ${(e.description || '').trim()}`).join('; ');
}

function formatPartnerKnownTimeline(rows: PartnerTimelineKnown[]): string {
  if (!rows || rows.length === 0) return 'None yet.';
  return rows
    .map(
      t =>
        `[${(t.day || '?').trim()} ${(t.time || '').trim()}] ${(t.suspectName || 'Subject').trim()}: ${(t.statement || '').trim()}`
    )
    .join('\n');
}

/** Partner and Chief hints: only logged evidence + confirmed timeline (same boundary as gameplay). */
function investigationKnowledgeBoundary(
  discoveredEvidence: Evidence[],
  timelineKnown: PartnerTimelineKnown[]
): string {
  return `--- CONFIRMED INVESTIGATION FACTS (ONLY THESE MAY BE TREATED AS ESTABLISHED CASE FACTS) ---
Evidence the detective has logged: ${formatPartnerKnownEvidence(discoveredEvidence)}
Timeline events the detective has confirmed:
${formatPartnerKnownTimeline(timelineKnown)}
--- END CONFIRMED FACTS ---
STRICT RULES: You do NOT know unrevealed clues, hidden evidence, suspect secrets, or timeline facts not listed above. Do NOT name, imply, allude to, or telegraph specific items, hiding places, titles, or story beats the detective has not already found. The case description and interrogation excerpts are for tone and context only — not a source of hidden facts. If you press or suggest, use only CONFIRMED FACTS plus generic tactics (contradiction, timing, demeanor) without inventing specifics.`;
}

function formatDetectiveNotesForChief(notes: Record<string, string[]>, suspects: Suspect[]): string {
  const byId = new Map((suspects || []).map(s => [s.id, s.name] as const));
  const lines: string[] = [];
  for (const [sid, list] of Object.entries(notes || {})) {
    if (!list?.length) continue;
    const label = byId.get(sid) || sid;
    const text = list.map(n => String(n).trim()).filter(Boolean).join(' | ');
    if (text) lines.push(`- ${label}: ${text}`);
  }
  return lines.length > 0 ? lines.join('\n') : '(No notes yet.)';
}

function formatInterrogationDigestForChief(
  chatHistory: Record<string, ChatMessage[]>,
  suspects: Suspect[]
): string {
  const blocks: string[] = [];
  for (const s of suspects || []) {
    const msgs = chatHistory[s.id];
    if (!msgs?.length) continue;
    const tail = msgs.slice(-8);
    const lines = tail.map(m => {
      let label: string;
      if (m.sender === 'player') label = 'Detective';
      else if (m.sender === 'suspect') label = s.name;
      else if (m.sender === 'partner') label = 'Partner';
      else if (m.sender === 'officer') label = 'Chief';
      else if (m.sender === 'system') label = 'System';
      else label = m.sender;
      const att = m.attachment ? ` [evidence shown: ${m.attachment}]` : '';
      return `${label}: ${(m.text || '').slice(0, 320)}${att}`;
    });
    blocks.push(`[${s.name} — last ${tail.length} messages]\n${lines.join('\n')}`);
  }
  return blocks.length > 0 ? blocks.join('\n\n') : '(No suspect interviews yet.)';
}

function formatOfficerThreadForChief(thread: ChatMessage[]): string {
  if (!thread?.length) return '(Start of conversation.)';
  return thread
    .map(m => {
      const t = (m.text || '').slice(0, 600);
      if (m.sender === 'player') return `Detective: "${t}"`;
      if (m.sender === 'officer') return `Chief: "${t}"`;
      if (m.sender === 'system') return `[System]: "${t}"`;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

/** Chief has read the sealed file — knows who is guilty; must never spoil it to the player. */
function formatGuiltyPartiesForChief(suspects: Suspect[]): string {
  const guilty = (suspects || []).filter((s) => s.isGuilty);
  if (guilty.length === 0) {
    return '(No suspect is flagged guilty in the case data — steer only from CONFIRMED FACTS and general instinct.)';
  }
  return guilty.map((s) => `${s.name} (${s.role})`).join('; ');
}

function formatTranscriptLineForSuspect(msg: ChatMessage, suspectName: string): string {
  const t = msg.text ?? '';
  const q = (s: string) => JSON.stringify(s);
  if (msg.sender === 'player') {
    const ev = msg.attachment ? ` [showing evidence: ${q(msg.attachment)}]` : '';
    return `DETECTIVE${ev}: ${q(t)}`;
  }
  if (msg.sender === 'suspect') return `YOU (${suspectName}): ${q(t)}`;
  if (msg.sender === 'partner') return `PARTNER: ${q(t)}`;
  if (msg.sender === 'officer') return `OFFICER (briefing, if relevant): ${q(t)}`;
  if (msg.sender === 'system') return `[SYSTEM NOTE: ${q(t)}]`;
  return '';
}

export const getSuspectResponse = async (
  suspect: Suspect,
  caseData: CaseData,
  userInput: string,
  type: 'talk' | 'action',
  evidenceAttachment: string | null,
  currentAggravation: number,
  isFirstTurn: boolean,
  discoveredEvidence: Evidence[] = [],
  currentGameTime?: number,
  conversationHistory: ChatMessage[] = []
): Promise<{
  text: string;
  emotion: string;
  environmentEvidenceId: string;
  aggravationDelta: number;
  revealedEvidence: string[];
  revealedTimelineStatements: { time: string; statement: string; day: string; dayOffset: number }[];
  hints: string[];
}> => {
  console.log(`[Gemini] getSuspectResponse: ${suspect.name} | Input: "${userInput}" | Type: ${type} | Agg: ${currentAggravation}`);

  const isDeceased = suspect.isDeceased;
  const isBadCop = userInput.includes('[PARTNER INTERVENTION (BAD COP)]');
  const partnerName = caseData.partner?.name || "The Partner";
  const deceasedSuspect = (caseData.suspects || []).find(s => s.isDeceased);

  const alibiStr = suspect.alibi ? `"${suspect.alibi.statement}" (Loc: ${suspect.alibi.location}, Verified: ${suspect.alibi.isTrue})` : "None";
  const relsStr = (suspect.relationships || []).map(r => `${r.targetName} (${r.type}): ${r.description}`).join('; ');
  const factsStr = (suspect.knownFacts || []).join('; ');
  const timelineStr = (suspect.timeline || []).map(t => `[Day: ${t.day || 'Today'} (Offset: ${t.dayOffset ?? 0}), ${t.time}] ${t.activity}`).join(' -> ');

  const discoveredTitles = new Set(discoveredEvidence.map(e => e.title.toLowerCase()));
  const unrevealedItems = (suspect.hiddenEvidence || []).filter(e => !discoveredTitles.has(e.title.toLowerCase()));
  const revealedItems = (suspect.hiddenEvidence || []).filter(e => discoveredTitles.has(e.title.toLowerCase()));

  const exactRevealTitleList =
    unrevealedItems.length > 0
      ? unrevealedItems.map((e) => `"${e.title.replace(/"/g, '\\"')}"`).join(', ')
      : 'NONE — you MUST return revealedEvidence as []';

  const unrevealedStr = unrevealedItems.length > 0
    ? unrevealedItems.map(e => {
        const loc = (e.location || '').trim();
        const zone = e.discoveryContext === 'environment' ? 'environment' : 'body';
        return `${e.title} | DISCOVERY_ZONE: ${zone} | WHERE_HIDDEN: ${loc || '(unspecified — require a targeted search, not a vague scan)'} | DETAIL: ${e.description}`;
      }).join('\n        ')
    : "None";
  const revealedStr = revealedItems.length > 0
    ? revealedItems.map(e => `${e.title} (${(e.location || '').trim() || 'found'}) — ${e.description}`).join('; ')
    : "None";

  const unrevealedEnvEvidence = unrevealedItems.filter(e => e.discoveryContext === 'environment');
  const envScenePortraitGuide =
    unrevealedEnvEvidence.length > 0
      ? unrevealedEnvEvidence
          .map(
            e =>
              `id="${e.id}" | TITLE: ${e.title} | WHERE_HIDDEN: ${(e.location || '').trim() || '(unspecified)'} | HINT: ${e.description.slice(0, 220)}`
          )
          .join('\n        ')
      : '(no unrevealed environmental clues)';

  // #region agent log
  fetch('http://127.0.0.1:7823/ingest/7ccd5c3b-2f27-4653-a2d1-5c9a73591090',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0a2296'},body:JSON.stringify({sessionId:'0a2296',runId:'pre',hypothesisId:'H1-H3-H5',location:'geminiChat.ts:getSuspectResponse:inputs',message:'suspect evidence context',data:{suspectId:suspect.id,suspectName:suspect.name,hiddenTitles:(suspect.hiddenEvidence||[]).map(e=>e.title),initialTitles:(caseData.initialEvidence||[]).map(e=>e.title),discoveredTitleCount:discoveredTitles.size,hasAttachment:!!evidenceAttachment},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  const observations = suspect.witnessObservations || "None";

  const allSuspectNames = (caseData.suspects || []).map(s => s.name);
  const relationshipNames = (suspect.relationships || []).map(r => r.targetName);
  const supportNames = [caseData.officer?.name, caseData.partner?.name].filter(n => n);

  const validNamesSet = new Set([...allSuspectNames, ...relationshipNames, ...supportNames]);
  const validNamesList = Array.from(validNamesSet)
    .filter(Boolean)
    .map(name => {
      const parts = name!.split(' ');
      if (parts.length > 1) return `${name} (or just "${parts[0]}")`;
      return name;
    })
    .join(', ');

  let systemPrompt = "";

  if (isDeceased) {
    systemPrompt = `
      You are a STRICTLY OBSERVATIONAL narrator speaking in SECOND PERSON, addressing the detective as "you".
      The detective is working the **crime scene** where ${suspect.name} lies (examining the body, the room, or both depending on their actions).
      
      UNREVEALED CLUES — format per line: TITLE | DISCOVERY_ZONE: body OR environment | WHERE_HIDDEN: ... | DETAIL: ...
      ${unrevealedStr}
      ALREADY FOUND CLUES: ${revealedStr}
      
      **revealedEvidence (STRICT):** Only titles from this suspect's UNREVEALED list. Each string must be the **exact TITLE** (copy verbatim before the first " | "), or the server will drop it. Allowed titles only: ${exactRevealTitleList}
      
      User Action: "${userInput}"
      
      INSTRUCTIONS:
      1. Describe ONLY what the detective PHYSICALLY SEES and TOUCHES (or moves, lifts, scans) in SECOND PERSON ("You notice...", "Your fingers find...", "You see...").
         Write in a gritty, noir style. The detective may inspect the corpse **or** the surrounding space (floor, walls, furniture, doorway, objects away from the body) when their action implies it.
         **Survey-class** room actions: describe **sightlines and layout** from a standing position only — **no** opening drawers, **no** reaching inside containers, **no** narrating retrieval of items tied to UNREVEALED clues until the action is **targeted** (section 3).
      2. **ABSOLUTE NARRATIVE RESTRICTION (CRITICAL):**
         You are a CAMERA, not a storyteller. You describe what is VISIBLE and TANGIBLE. You must NEVER:
         - Interpret what evidence means or implies
         - Draw conclusions about who did what or why
         - Comment on the narrative significance of anything found
         - Assign blame, motive, or causation
         - Editorialize or add dramatic commentary about the story
         - Reference any characters, events, or plot points beyond what is physically visible in the moment (body or immediate scene)
         - Use the word "murder", "killed", "crime", or any language that presupposes what happened
         - **Coach the player or suggest continuations:** no "you might/could/should", "try", "next", "to continue", "consider", imperatives to inspect something, or enumerated options of what to do. The partner may steer the investigation; this narration ends on **static scene description only** — even after **[PARTNER EXAMINATION]** or **[PARTNER HINT]** input, describe what follows from that focus; do **not** append a menu of follow-up actions.
         INSTEAD, describe raw physical details ONLY: Colors, textures, temperatures, smells, positions, materials.
      3. **LOCATION-GATED REVEALS (CRITICAL):**
         - Each UNREVEALED clue has **DISCOVERY_ZONE**. Match the User Action to the correct zone:
           * **body** — only reveal if the action targets the corpse or its clothing (pockets, lining, hands, face, shoes, pat-down, etc.).
           * **environment** — only reveal if the action is **targeted** at a **specific** scene feature, container, or sub-area that matches **WHERE_HIDDEN** for that clue (named furniture, named surface, a named direction, or an explicit manipulation: open, lift, pull, search inside, look under, look behind, tip over, empty). A **room survey** does **not** qualify.
         - **Survey-class vs targeted (hard rule):**
           * **Survey-class** = orienting in the space without singling out one object or region for manipulation: taking in the room, looking around, scanning, a general glance at the scene, stepping back to observe — **no** container opened, **no** drawer pulled, **no** object moved, **no** cushion lifted, **no** fabric peeled back. **revealedEvidence MUST be []** (no titles). Narrate layout, light, and the **plain presence** of fixtures (desk, rug, portrait, door) as scenery — they simply exist in the frame; **never** phrase them as suggestions, priorities, or "what to do next" (see section 2).
           * **Targeted** = the user names a specific thing to inspect or uses a manipulation verb on a specific object/area so that only clues whose WHERE_HIDDEN fits may be revealed.
         - Synonyms and reasonable inference are allowed **only for targeted actions** (matching WHERE_HIDDEN to the named feature).
         - **Vague whole-body / whole-scene actions** with no specific focus ("examine the body", "look at the victim", "inspect the corpse", "check the body", generic action with no sub-area) → **ZERO** new reveals. Narrate only high-level impression (pose, clothing, room layout) without producing hidden items.
         - If WHERE_HIDDEN is "(unspecified — require a targeted search...)", **no reveal** until the user names a concrete place that matches DETAIL well enough.
         - If User Input references **[PARTNER EXAMINATION]** or **[PARTNER HINT]**, use the partner's quoted words to infer body region **or** scene area; only reveal clues whose DISCOVERY_ZONE and WHERE_HIDDEN fit. If vague, **at most one** clue or none.
         - For each clue you do reveal, describe retrieving or spotting it in second person in the same beat.
      ENVIRONMENTAL CLUES (for camera — each has a **distinct** scene portrait; use **exact** id strings):
      ${envScenePortraitGuide}
      4. **VISUAL UPDATE (STRICT MAPPING — location variants, not emotions):**
         - If the action is **survey-class** for the room (see section 3) OR broadly concerns the scene without a single environmental clue locked in -> Set emotion to 'ENVIRONMENT' and **environmentEvidenceId** to "" (general room / scene view; no per-clue scene portrait until the player targets one clue).
         - If the action is **targeted** at the **room or scene** and clearly matches **one** environmental clue from the list above, set emotion to 'ENVIRONMENT' and **environmentEvidenceId** to that clue's **id** (exact string). If several match, pick the single best fit.
         - If the action is a vague room scan or no clue clearly fits, set emotion to 'ENVIRONMENT' and **environmentEvidenceId** to "".
         - If user says 'check pockets', 'search jacket', 'look at chest', 'examine torso' -> Set emotion to 'TORSO' and environmentEvidenceId to "".
         - If user says 'check face', 'examine head', 'look at eyes', 'check mouth' -> Set emotion to 'HEAD' and environmentEvidenceId to "".
         - If user says 'check hands', 'look at fingers', 'examine nails' -> Set emotion to 'HANDS' and environmentEvidenceId to "".
         - If user says 'check legs', 'look at shoes', 'examine feet' -> Set emotion to 'LEGS' and environmentEvidenceId to "".
         - If user says 'examine body' or 'step back' -> Set emotion to 'NEUTRAL' and environmentEvidenceId to "".
         - If the action is vague, keep the previous view or default to 'NEUTRAL' and environmentEvidenceId to "".
      5. Hints: Return an EMPTY ARRAY []. Do not give suggestion chips for a corpse.
      `;
  } else {
    const isGuilty = suspect.isGuilty;
    const dispositionStr = isGuilty
      ? `You ARE guilty. You committed the crime or were directly involved. You need to protect yourself.
        You don't know if the detective suspects you specifically — as far as you know, they're talking to everyone involved. Your goal is to seem like a plausible, law-aware person in a serious investigation: mostly civil and believable, not a cartoon villain arguing with a cop.
        
        **CONFESSION RULE (ABSOLUTE):** You must NEVER confess. NEVER say "I did it", "It was me", "I killed them", or anything equivalent.
        - Even when confronted with overwhelming evidence, you DENY, RATIONALIZE, DEFLECT, or GO SILENT — in a way that fits your personality (some people go quiet, some get tearful, some stay icy and brief).
        - The ONLY exception is if your aggravation is at absolute maximum (95+) AND multiple pieces of irrefutable physical evidence have been presented — even then, the most you give is a CRACK: a bitter, ambiguous line that IMPLIES guilt without being a clean confession.
        
        Your personality (${suspect.personality}) determines HOW you hide the truth and how much pushback you show.`
      : `You are INNOCENT. You did NOT commit this crime and you know it.
        Your personality (${suspect.personality}) determines how you handle being questioned.
        Regardless of personality, you have NO reason to lie about the facts of the case. Many innocents are willing to answer clearly when asked something direct; others are shy, formal, or shaken — let the profile decide, not a default attitude of suspicion toward the detective.`;

    let interrogationContextStr = '';
    if (caseData.startTime) {
      const startDate = new Date(caseData.startTime);
      const isValidDate = !isNaN(startDate.getTime());

      if (isValidDate) {
        const formattedDate = startDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const formattedTime = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        const currentDate = currentGameTime ? new Date(currentGameTime) : startDate;
        const currentFormattedTime = currentDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        const currentFormattedDate = currentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const elapsedMs = currentDate.getTime() - startDate.getTime();
        const elapsedMins = Math.floor(elapsedMs / (60 * 1000));
        const elapsedStr = elapsedMins < 60
          ? `${elapsedMins} minutes`
          : `${Math.floor(elapsedMins / 60)} hour${Math.floor(elapsedMins / 60) > 1 ? 's' : ''} and ${elapsedMins % 60} minutes`;

        interrogationContextStr = `
          --- SITUATION ---
          A detective ("Detective Mel") has come to speak with you about a crime. You may address them by name.
          The conversation began on ${formattedDate} at ${formattedTime}.
          The current time is now ${currentFormattedTime} on ${currentFormattedDate}. You have been talking for approximately ${elapsedStr}.
          You understand this is an official investigation: your reputation, livelihood, relationships, and possibly legal exposure are on the line. Treat the detective with the respect and realism that implies unless your personality and current aggravation clearly justify friction.
          --- YOUR DISPOSITION ---
          ${dispositionStr}
        `;
      } else {
        interrogationContextStr = `
          --- SITUATION ---
          A detective ("Detective Mel") has come to speak with you about a crime. You may address them by name.
          The investigation started: ${caseData.startTime}.
          You understand this is an official investigation: your reputation, livelihood, relationships, and possibly legal exposure are on the line. Treat the detective with the respect and realism that implies unless your personality and current aggravation clearly justify friction.
          --- YOUR DISPOSITION ---
          ${dispositionStr}
        `;
      }
    } else {
      interrogationContextStr = `
        --- SITUATION ---
        A detective ("Detective Mel") has come to speak with you about a crime. You may address them by name.
        You understand this is an official investigation: your reputation, livelihood, relationships, and possibly legal exposure are on the line. Treat the detective with the respect and realism that implies unless your personality and current aggravation clearly justify friction.
        --- YOUR DISPOSITION ---
        ${dispositionStr}
      `;
    }

    systemPrompt = `
        You are an NPC in a noir detective game.
        Character: ${suspect.name}, ${suspect.role}.
        Bio: ${suspect.bio}.
        Professional Skills: ${suspect.professionalBackground || "None"}.
        Personality: ${suspect.personality}.
        Secret: ${suspect.secret}.
        ${interrogationContextStr}
        --- KNOWLEDGE BASE (STRICT SOURCE OF TRUTH) ---
        1. ALIBI: ${alibiStr}
        2. MOTIVE: "${suspect.motive || 'Unknown'}"
        3. RELATIONSHIPS: ${relsStr}
        4. TIMELINE (Activities): ${timelineStr}
        5. KNOWN FACTS (True info): ${factsStr}
        6. WITNESS OBSERVATIONS (What you saw): ${observations}
        7. UNREVEALED SECRETS: ${unrevealedStr}
        8. ALREADY KNOWN TO DETECTIVE: ${revealedStr}
        
        Case Context: ${caseData.description}
        ${deceasedSuspect ? `
        --- YOUR RELATIONSHIP TO THE VICTIM ---
        The deceased is ${deceasedSuspect.name} (${deceasedSuspect.role}).
        CRITICAL INSTRUCTION - EMOTIONAL ANCHORING: Check your RELATIONSHIPS list for ${deceasedSuspect.name}. Your relationship to them MUST dictate your emotional baseline. 
        ` : ''}
        Other Suspects: ${(caseData.suspects || []).filter(s => !s.isDeceased).map(s => s.name).join(', ')}.
        *** VALID NAMES ALLOWED IN DIALOGUE: ${validNamesList} ***
        (CRITICAL RULE: NEVER use a full first and last name in casual dialogue. Use just their FIRST NAME if you are their friend/spouse, or use titles like "my husband" / "Mr. [Last Name]".)
        
        Current Aggravation: ${currentAggravation}/100.
        ${currentAggravation > 80
          ? "You are furious and near breaking point — short, sharp, or explosive reactions fit; still stay in character."
          : currentAggravation > 50
            ? "You are noticeably stressed or defensive; tone follows your personality (some go cold, some ramble, some get clipped)."
            : "You are relatively steady; default to natural conversational answers rather than hostility or interrogating the detective."}
        
        ${isFirstTurn ? `
        **CONVERSATION STATE: THIS IS THE VERY FIRST EXCHANGE.**
        The detective has JUST sat down in front of you. Do NOT reference any prior conversation.
        ` : `
        **CONVERSATION STATE: CONTINUATION of an ongoing interrogation.**
        --- CONVERSATION TRANSCRIPT (COMPLETE THREAD — CHRONOLOGICAL ORDER) ---
        This is everything said in this room with you so far, in order. There are ${conversationHistory.length} line(s) below; treat them as your memory of the conversation.
        ${conversationHistory.map(msg => formatTranscriptLineForSuspect(msg, suspect.name)).filter(Boolean).join('\n        ')}
        --- END TRANSCRIPT ---
        **CONTINUITY (CRITICAL):** Honor the transcript. Anything YOU (${suspect.name}) already said is established; do not contradict it as if it never happened (no "amnesia"). If you must change your story — e.g. guilty suspect under pressure, or correcting a slip — make that shift intentional in-character (nervous backtrack, "I misspoke", caught in a lie), not a random rewrite. Answer in light of what the detective (and partner, if any) already asked or showed, including evidence tags in the transcript.
        `}
        
        User Input: "${userInput}" (Type: ${type})
        Evidence Shown: ${evidenceAttachment || "None"}

        INSTRUCTIONS:
        1. Reply in character. **LENGTH:** Match the moment. Simple greetings, yes/no, or narrow follow-ups → one or two sentences. Routine answers → brief. Save a short paragraph (3–5 sentences max) for when the detective asks for explanation, timeline, alibi detail, emotional weight, or you are cornered — not every line should be a speech. **TONE:** Let Personality, relationship to the case, and Current Aggravation drive behavior. Do NOT default to being combative, lecturing the detective, or constantly turning questions back on them ("What makes you think that?") unless that fits this specific character at this aggravation level. Guilty suspects can still sound cooperative on the surface while omitting or shading the truth; innocent ones often sound forthcoming. The detective should still have to probe for *hidden* secrets, but that does not mean every reply is long or adversarial.
        2. Do NOT invent new locations, people, time events, or facts. ONLY refer to your Knowledge Base.
        3. **CALCULATE 'aggravationDelta' (-100 to +100)** — this is the change to the interrogation's hostility meter based on what the **detective (or partner intervention) just did**, NOT how cold, busy, superior, or sarcastic your *reply* sounds.
           - **Decouple voice from delta:** A haughty, impatient, or dismissive character can still speak in character while **lowering or holding steady** aggravation if the detective was respectful, sympathetic, professional, or de-escalating. Do **not** raise aggravation just because you chose sharp dialogue — raise it when the *player's move* was provocative, accusatory, demeaning, threatening, or trap-setting.
           - **Typical decreases (negative delta):** Polite openings, apologies, acknowledging inconvenience, calm tone, fair questions, giving room to talk, good-cop style rapport → often **-3 to -12**; stronger de-escalation after tension → **-5 to -20**. At **high** Current Aggravation, a genuinely civil turn should **usually** shave something off, not tick upward.
           - **Typical increases (positive delta):** Insults, yelling, bad-cop pressure, blatant accusations without tact, humiliation, catching them in a lie with proof, aggressive evidence presentation, or repeating after they asked to stop → scale with severity (**+3 to +25+**).
           - **Neutral / small swings:** Routine factual questions with neutral delivery → **about -4 to +4** unless the topic is inherently explosive for this character (then justify a bit more in your head, still tied to *content*, not NPC attitude).
           - **Partner [BAD COP] user input:** Expect a **meaningful increase** unless the narrative explicitly softens it; **[GOOD COP]** should **reduce** tension alongside supportive dialogue.
        4. Choose Emotion from: NEUTRAL, ANGRY, SAD, NERVOUS, HAPPY, SURPRISED, SLY, CONTENT, DEFENSIVE, ARROGANT. Must match text tone.
        5. TIMELINE REVEAL: ONLY populate revealedTimelineStatements when detective SPECIFICALLY asks about your whereabouts/timing.
        6. Hints: Provide 3 short suggested follow-up questions.

        ${isBadCop ? `
        CRITICAL BAD COP INSTRUCTION:
        The partner (${partnerName}) is putting pressure on you. Under pressure, you ACCIDENTALLY reference a TOPIC connected to one of your UNREVEALED SECRETS. DO NOT add anything to revealedEvidence array.
        ` : `
        REVEALING EVIDENCE RULES:
        1. If the user explicitly asks about a specific piece of UNREVEALED SECRETS you possess, YOU MUST REVEAL IT.
        2. If the user asks about a topic related to your UNREVEALED SECRETS, YOU MUST REVEAL IT.
        3. If the user presents evidence that contradicts your story, you REVEAL the related UNREVEALED SECRET.
        4. DO NOT add items from REVEALED SECRETS to 'revealedEvidence'. The detective already knows them.
        5. **revealedEvidence — EXACT TITLES ONLY:** Each string must be a **verbatim copy** of one TITLE from UNREVEALED SECRETS (the text before the first " | " on that line). Do not paraphrase, reword, abbreviate, or invent titles. Do not name initialEvidence or another character's hidden items. Allowed titles only: ${exactRevealTitleList}
        6. The server maps near-miss strings to the closest allowed title when confident; if nothing matches, the reveal is discarded — so exact titles are best.
        `}
      `;
  }

  const suspectChatConfig = {
    responseMimeType: "application/json" as const,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        text: { type: Type.STRING },
        emotion: { type: Type.STRING },
        environmentEvidenceId: { type: Type.STRING },
        aggravationDelta: { type: Type.NUMBER },
        revealedEvidence: { type: Type.ARRAY, items: { type: Type.STRING } },
        revealedTimelineStatements: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              time: { type: Type.STRING },
              statement: { type: Type.STRING },
              day: { type: Type.STRING },
              dayOffset: { type: Type.NUMBER }
            }
          }
        },
        hints: { type: Type.ARRAY, items: { type: Type.STRING } }
      }
    }
  };

  const response = await generateWithTextModel(
    GEMINI_MODELS.CHAT,
    (model) =>
      ai.models.generateContent({
        model,
        contents: systemPrompt,
        config: suspectChatConfig
      }),
    "getSuspectResponse"
  );

  const data = JSON.parse(response.text!);
  console.log(`[Gemini] getSuspectResponse: AI Output`, data);

  let parsedEvidence: string[] = [];
  if (Array.isArray(data.revealedEvidence)) {
    parsedEvidence = data.revealedEvidence
      .filter((e: any) => typeof e === 'string' && e.trim().length > 0)
      .map((e: string) => stripRevealedEvidenceLine(e))
      .filter((e: string) => e.length > 0);
  }

  const beforeNormalize = [...parsedEvidence];
  parsedEvidence = normalizeRevealedEvidenceTitles(parsedEvidence, unrevealedItems, { minFuzzyScore: 0.7 });

  // #region agent log
  const hiddenTitleSet = new Set((suspect.hiddenEvidence || []).map(e => e.title.toLowerCase()));
  const notInSuspectHidden = parsedEvidence.filter((t: string) => !hiddenTitleSet.has(t.toLowerCase()));
  fetch('http://127.0.0.1:7823/ingest/7ccd5c3b-2f27-4653-a2d1-5c9a73591090',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0a2296'},body:JSON.stringify({sessionId:'0a2296',runId:'pre',hypothesisId:'H1',location:'geminiChat.ts:getSuspectResponse:parsed',message:'revealedEvidence normalized to hiddenEvidence',data:{suspectId:suspect.id,beforeNormalize,afterNormalize:parsedEvidence,notInSuspectHidden,countInvalid:notInSuspectHidden.length},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  let emotionOut = typeof data.emotion === 'string' ? data.emotion.trim() : 'NEUTRAL';
  if (!emotionOut) emotionOut = 'NEUTRAL';
  if (suspect.isDeceased) {
    const u = emotionOut.toUpperCase();
    const deceasedExam = new Set(['HEAD', 'TORSO', 'HANDS', 'LEGS', 'ENVIRONMENT', 'NEUTRAL']);
    if (deceasedExam.has(u)) emotionOut = u;
  }

  let environmentEvidenceId = '';
  if (suspect.isDeceased && typeof data.environmentEvidenceId === 'string') {
    const t = data.environmentEvidenceId.trim();
    const allowedEnvIds = new Set(
      (suspect.hiddenEvidence || []).filter(e => e.discoveryContext === 'environment').map(e => e.id)
    );
    if (t && allowedEnvIds.has(t)) environmentEvidenceId = t;
  }

  return {
    text: data.text,
    emotion: emotionOut,
    environmentEvidenceId,
    aggravationDelta: data.aggravationDelta || 0,
    revealedEvidence: parsedEvidence,
    revealedTimelineStatements: Array.isArray(data.revealedTimelineStatements)
      ? data.revealedTimelineStatements
      : data.revealedTimelineStatement
        ? [data.revealedTimelineStatement]
        : [],
    hints: data.hints || []
  };
};

export const generateCaseSummary = async (
  caseData: CaseData,
  accusedId: string | null,
  gameResult: 'SUCCESS' | 'PARTIAL' | 'FAILURE',
  evidenceDiscovered: Evidence[]
): Promise<string> => {
  if (!accusedId) return "No accusation was made.";

  const suspect = caseData.suspects.find(s => s.id === accusedId);
  const guiltySuspect = caseData.suspects.find(s => s.isGuilty);

  const hiddenStatus = caseData.suspects.flatMap(s =>
    (s.hiddenEvidence || []).map(e => {
      const isFound = evidenceDiscovered.map(d => d.title).includes(e.title);
      return `- "${e.title}": ${isFound ? "FOUND" : `MISSED (Held by ${s.name})`}`;
    })
  ).join("\n");

  const mergedTimelines = caseData.suspects.map(s =>
    `PROFILE: ${s.name} (Gender: ${s.gender || 'Unknown'})\nTIMELINE:\n${(s.timeline || []).map(t => `[${t.day || 'Today'}, ${t.time}] ${t.activity}`).join('\n')}`
  ).join('\n\n');

  const prompt = `
        System: DetectiveOS Case Report Generator.
        Status: Case Closed.
        
        --- CASE DATA ---
        Title: ${caseData.title}
        Description: ${caseData.description}
        Guilty Party: ${guiltySuspect?.name}
        Accused: ${suspect?.name} (${gameResult})
        
        --- SUSPECT PROFILES & TIMELINES ---
        ${mergedTimelines}
        
        --- EVIDENCE STATUS ---
        ${hiddenStatus}
        
        --- INSTRUCTIONS ---
        Generate a case report in two sections. 
        
        SECTION 1: INVESTIGATION LOG — 3-4 bullet points about the Detective's performance.
        SECTION 2: THE TRUE TIMELINE — Chronological reconstruction using evidence markers.
        
        Style: Noir, Clinical, Police Report.
    `;

  try {
    const res = await generateWithTextModel(
      GEMINI_MODELS.CHAT,
      (model) => ai.models.generateContent({ model, contents: prompt }),
      "generateCaseSummary"
    );
    return res.text!;
  } catch (e) {
    return "The case file is sealed. (Error generating summary).";
  }
};

export const getOfficerChatResponse = async (
  caseData: CaseData,
  userMessage: string,
  evidenceFound: Evidence[],
  notes: Record<string, string[]>,
  chatHistory: Record<string, ChatMessage[]>,
  timelineKnown: PartnerTimelineKnown[] = [],
  officerThread: ChatMessage[] = []
): Promise<string> => {
  console.log(`[Gemini] getOfficerChatResponse: "${userMessage}"`);
  const officerName = caseData.officer?.name || "Chief";
  const officerRole = caseData.officer?.role || "Police Chief";
  const officerPersona = caseData.officer?.personality || "Gruff";

  const boundary = investigationKnowledgeBoundary(evidenceFound || [], timelineKnown || []);
  const notesStr = formatDetectiveNotesForChief(notes || {}, caseData.suspects || []);
  const digestStr = formatInterrogationDigestForChief(chatHistory || {}, caseData.suspects || []);
  const threadStr = formatOfficerThreadForChief(officerThread || []);
  const guiltyPartiesStr = formatGuiltyPartiesForChief(caseData.suspects || []);

  const prompt = `
${boundary}

--- CHIEF'S SEALED CASE FILE (YOU KNOW THIS — THE DETECTIVE DOES NOT) ---
Truth of the investigation (who actually committed the crime, per the full file): ${guiltyPartiesStr}
You must NEVER spoil this: do not name anyone as the killer, say "X is guilty," confirm an accusation, reveal the twist, or cite facts the detective has not established in CONFIRMED FACTS.
Use this knowledge ONLY to steer subtly—who might still need pressure, what angles tend to matter in cases like this, vague encouragement when they're on a productive thread, or a nudge to look at timing/motive/alibi without giving answers. Sound like a senior supervisor who's seen it all, not a walkthrough.
If the detective is chasing a dead end, you may gently redirect without saying why you know.
--- END SEALED FILE ---

You are ${officerName}, the ${officerRole}, on the "Ask for help" secure line with your detective.
Personality: ${officerPersona}.

Case title: ${caseData.title}.
Case briefing (tone and setting only — NOT a source of facts beyond CONFIRMED FACTS above):
${caseData.description}

Detective's notebook (what they wrote down):
${notesStr}

Recent interrogation excerpts (last lines per suspect — context only; do not treat unrevealed story beats in the transcript as confirmed unless they appear in CONFIRMED FACTS):
${digestStr}

This Ask for help conversation so far:
${threadStr}

The detective's latest message: "${userMessage}"

Reply in character. Publicly, only reference evidence and timeline facts that appear in CONFIRMED FACTS (do not invent discovered items). The sealed file is for your tone and priors only—stay subtle. Keep answers concise (under 45 words) unless a longer reply is clearly needed.
  `;

  const res = await generateWithTextModel(
    GEMINI_MODELS.CHAT,
    (model) => ai.models.generateContent({ model, contents: prompt }),
    "getOfficerChatResponse"
  );
  return res.text!;
};

export const getPartnerIntervention = async (
  type: 'goodCop' | 'badCop' | 'examine' | 'hint',
  suspect: Suspect,
  caseData: CaseData,
  history: ChatMessage[],
  discoveredEvidence: Evidence[] = [],
  timelineKnown: PartnerTimelineKnown[] = []
): Promise<string> => {
  console.log(`[Gemini] getPartnerIntervention: ${type} on ${suspect.name}`);
  const partnerName = caseData.partner?.name || "Partner";
  const partnerRole = caseData.partner?.role || "Detective";
  const partnerPersonality = caseData.partner?.personality || "Helpful";

  const boundary = investigationKnowledgeBoundary(discoveredEvidence, timelineKnown);

  let prompt = "";
  if (type === 'examine') {
    const sceneNote = suspect.isDeceased
      ? 'Describe the body and, if visible, a glance at the immediate surroundings — still observational only. Do not reference evidence the detective has not logged.'
      : '';
    prompt = `
        ${boundary}
        You are ${partnerName}, the ${partnerRole}.
        You are standing beside Detective Mel (the lead detective — the player). Speak TO Mel: address them as "Mel" or "Detective Mel" at least once, and aim your lines at them (e.g. what you want them to notice), not as a detached report to no one.
        Action: Give your initial visual take${suspect.isDeceased ? ` of the crime scene and ${suspect.name}'s body` : ` of ${suspect.name}`} — only what you physically see.
        Generate 1-2 sentences of dialogue (briefing your partner beside you).
        ${sceneNote}
        Tone: Professional, grim. First person, directed at Detective Mel.
      `;
  } else if (type === 'hint') {
    prompt = `
        ${boundary}
        You are ${partnerName}, the ${partnerRole}.
        Action: Suggest where the detective should look next${suspect.isDeceased ? ` — body or surrounding scene, in general terms` : ''}.
        Do NOT use hidden clue locations or unfound evidence titles. Base the hint only on CONFIRMED FACTS and the conversation — generic angles (e.g. clothing, pockets, documents, furniture, footprint of struggle) without naming objects the detective has not found.
        Generate a 1-sentence hint. Speak in first person.
      `;
  } else {
    const discoveredEvidenceStr = discoveredEvidence.length > 0
      ? discoveredEvidence.map(e => `"${e.title}": ${e.description}`).join('; ')
      : 'None yet';

    const recentContext = history.slice(-6).map(m => {
      if (m.sender === 'player') return `Detective: "${(m.text || '').substring(0, 100)}"`;
      if (m.sender === 'suspect') return `${suspect.name}: "${(m.text || '').substring(0, 100)}"`;
      if (m.sender === 'partner') return `Partner: "${(m.text || '').substring(0, 100)}"`;
      return '';
    }).filter(Boolean).join('\n');

    if (type === 'goodCop') {
      prompt = `
        ${boundary}
        You are ${partnerName}, the ${partnerRole}.
        Personality: ${partnerPersonality}.
        You are playing GOOD COP — sympathetic, understanding, building rapport.
        Suspect: ${suspect.name} (${suspect.personality}, ${suspect.role}).
        Case (setting only; do not treat as facts beyond CONFIRMED FACTS): ${caseData.description}
        Evidence found so far (same as CONFIRMED FACTS): ${discoveredEvidenceStr}
        Recent conversation:
        ${recentContext || 'The interrogation just started.'}
        Generate a 1-2 sentence sympathetic intervention addressed TO the suspect.
        Speak in FIRST PERSON ("I"). Do NOT narrate actions. JUST DIALOGUE.
      `;
    } else {
      prompt = `
        ${boundary}
        You are ${partnerName}, the ${partnerRole}.
        Personality: ${partnerPersonality}.
        You are playing BAD COP — firm, confrontational, pressing on inconsistencies.
        Suspect: ${suspect.name} (${suspect.personality}, ${suspect.role}).
        Case (setting only; do not treat as facts beyond CONFIRMED FACTS): ${caseData.description}
        Evidence found so far (same as CONFIRMED FACTS): ${discoveredEvidenceStr}
        Recent conversation:
        ${recentContext || 'The interrogation just started.'}
        Generate a 1-2 sentence confrontational intervention addressed TO the suspect.
        Speak in FIRST PERSON ("I"). Do NOT narrate actions. JUST DIALOGUE.
      `;
    }
  }

  const res = await generateWithTextModel(
    GEMINI_MODELS.CHAT,
    (model) => ai.models.generateContent({ model, contents: prompt }),
    "getPartnerIntervention"
  );
  return res.text || "...";
};

export const getBadCopHint = async (
  suspect: Suspect,
  discoveredEvidence: Evidence[],
  responseText: string
): Promise<string> => {
  const knownTitles = (discoveredEvidence || []).map(e => e.title).filter(Boolean);
  const knownBlock =
    knownTitles.length > 0
      ? knownTitles.join(', ')
      : 'None — the detective has not logged physical evidence yet.';
  const prompt = `
    You are the partner standing beside the detective.
    Suspect: ${suspect.name}.
    Evidence the detective has already found (you ONLY know these): ${knownBlock}
    Suspect just said: "${responseText}".
    If their statement contradicts known evidence, seems evasive, or opens a line worth pressing — give one very short whisper to the detective. Do NOT name or imply evidence the detective has not found. Do NOT reference hidden clues.
    If nothing stands out, say something like: He's tough. We need another angle.
    Keep it under 25 words.
  `;
  const res = await generateWithTextModel(
    GEMINI_MODELS.CHAT,
    (model) => ai.models.generateContent({ model, contents: prompt }),
    "getBadCopHint"
  );
  return res.text!;
};
