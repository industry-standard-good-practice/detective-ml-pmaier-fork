import { Type } from "@google/genai";
import { ai, GEMINI_MODELS } from "./geminiClient.js";

/**
 * All chat-related Gemini service functions.
 * These are moved verbatim from frontend/services/geminiChat.ts.
 * The prompt engineering and response schemas are identical.
 */

// --- Types (subset of frontend types needed here) ---
interface Evidence { id: string; title: string; description: string; imageUrl?: string; }
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
  aggravationDelta: number;
  revealedEvidence: string[];
  revealedTimelineStatements: { time: string; statement: string; day: string; dayOffset: number }[];
  hints: string[]
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

  const unrevealedStr = unrevealedItems.length > 0 ? unrevealedItems.map(e => `${e.title} (${e.description})`).join('; ') : "None";
  const revealedStr = revealedItems.length > 0 ? revealedItems.map(e => `${e.title} (${e.description})`).join('; ') : "None";

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
      The detective is examining the body of ${suspect.name}.
      
      PHYSICAL CLUES ON BODY (UNREVEALED): ${unrevealedStr}
      ALREADY FOUND CLUES: ${revealedStr}
      
      User Action: "${userInput}"
      
      INSTRUCTIONS:
      1. Describe ONLY what the detective PHYSICALLY SEES and TOUCHES in SECOND PERSON ("You notice...", "Your fingers find...", "You see...").
         Write in a gritty, noir style. Be visceral and intimate — the detective's hands are doing the work, their eyes are seeing the details.
      2. **ABSOLUTE NARRATIVE RESTRICTION (CRITICAL):**
         You are a CAMERA, not a storyteller. You describe what is VISIBLE and TANGIBLE. You must NEVER:
         - Interpret what evidence means or implies
         - Draw conclusions about who did what or why
         - Comment on the narrative significance of anything found
         - Assign blame, motive, or causation
         - Editorialize or add dramatic commentary about the story
         - Reference any characters, events, or plot points beyond what is physically visible on the body
         - Use the word "murder", "killed", "crime", or any language that presupposes what happened
         INSTEAD, describe raw physical details ONLY: Colors, textures, temperatures, smells, positions, materials.
      3. If the user's action logically uncovers one of the UNREVEALED clues, YOU MUST REVEAL IT. 
         - Add each item's EXACT title to the 'revealedEvidence' array.
         - Describe finding it in second person.
      4. **VISUAL UPDATE (STRICT MAPPING):**
         - If user says 'check pockets', 'search jacket', 'look at chest', 'examine torso' -> Set emotion to 'TORSO'.
         - If user says 'check face', 'examine head', 'look at eyes', 'check mouth' -> Set emotion to 'HEAD'.
         - If user says 'check hands', 'look at fingers', 'examine nails' -> Set emotion to 'HANDS'.
         - If user says 'check legs', 'look at shoes', 'examine feet' -> Set emotion to 'LEGS'.
         - If user says 'examine body' or 'step back' -> Set emotion to 'NEUTRAL'.
         - If the action is vague, keep the previous view or default to 'NEUTRAL'.
      5. Hints: Return an EMPTY ARRAY []. Do not give suggestion chips for a corpse.
      `;
  } else {
    const isGuilty = suspect.isGuilty;
    const dispositionStr = isGuilty
      ? `You ARE guilty. You committed the crime or were directly involved. You need to protect yourself.
        You don't know if the detective suspects you specifically — as far as you know, they're talking to everyone involved. Your goal is to seem cooperative and normal while avoiding anything that could point suspicion at you.
        
        **CONFESSION RULE (ABSOLUTE):** You must NEVER confess. NEVER say "I did it", "It was me", "I killed them", or anything equivalent.
        - Even when confronted with overwhelming evidence, you DENY, RATIONALIZE, DEFLECT, or GO SILENT.
        - The ONLY exception is if your aggravation is at absolute maximum (95+) AND multiple pieces of irrefutable physical evidence have been presented — even then, the most you give is a CRACK: a bitter, ambiguous line that IMPLIES guilt without being a clean confession.
        
        Your personality (${suspect.personality}) determines HOW you hide the truth.`
      : `You are INNOCENT. You did NOT commit this crime and you know it.
        Your personality (${suspect.personality}) determines how you handle being questioned.
        Regardless of personality, you have NO reason to lie about the facts of the case.`;

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
          --- YOUR DISPOSITION ---
          ${dispositionStr}
        `;
      } else {
        interrogationContextStr = `
          --- SITUATION ---
          A detective ("Detective Mel") has come to speak with you about a crime. You may address them by name.
          The investigation started: ${caseData.startTime}.
          --- YOUR DISPOSITION ---
          ${dispositionStr}
        `;
      }
    } else {
      interrogationContextStr = `
        --- SITUATION ---
        A detective ("Detective Mel") has come to speak with you about a crime. You may address them by name.
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
        ${currentAggravation > 80 ? "You are furious and near breaking point." : "You are composed but guarded."}
        
        ${isFirstTurn ? `
        **CONVERSATION STATE: THIS IS THE VERY FIRST EXCHANGE.**
        The detective has JUST sat down in front of you. Do NOT reference any prior conversation.
        ` : `
        **CONVERSATION STATE: CONTINUATION of an ongoing interrogation.**
        --- CONVERSATION TRANSCRIPT ---
        ${conversationHistory.map(msg => {
      if (msg.sender === 'player') return 'DETECTIVE: "' + msg.text + '"';
      if (msg.sender === 'suspect') return 'YOU (' + suspect.name + '): "' + msg.text + '"';
      if (msg.sender === 'partner') return 'PARTNER: "' + msg.text + '"';
      if (msg.sender === 'system') return '[SYSTEM NOTE: ' + msg.text + ']';
      return '';
    }).filter(Boolean).join('\n        ')}
        --- END TRANSCRIPT ---
        `}
        
        User Input: "${userInput}" (Type: ${type})
        Evidence Shown: ${evidenceAttachment || "None"}

        INSTRUCTIONS:
        1. Reply in character. Vary response length and tone. Make the detective WORK for info.
        2. Do NOT invent new locations, people, time events, or facts. ONLY refer to your Knowledge Base.
        3. CALCULATE 'aggravationDelta' (Change in anger, from -100 to +100).
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
        `}
      `;
  }

  const response = await ai.models.generateContent({
    model: GEMINI_MODELS.CHAT,
    contents: systemPrompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          emotion: { type: Type.STRING },
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
    }
  });

  const data = JSON.parse(response.text!);
  console.log(`[Gemini] getSuspectResponse: AI Output`, data);

  let parsedEvidence: string[] = [];
  if (Array.isArray(data.revealedEvidence)) {
    parsedEvidence = data.revealedEvidence.filter((e: any) => typeof e === 'string' && e.trim().length > 0);
  }

  return {
    text: data.text,
    emotion: data.emotion || 'NEUTRAL',
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
    const res = await ai.models.generateContent({
      model: GEMINI_MODELS.CHAT,
      contents: prompt
    });
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
  chatHistory: Record<string, ChatMessage[]>
): Promise<string> => {
  console.log(`[Gemini] getOfficerChatResponse: "${userMessage}"`);
  const officerName = caseData.officer?.name || "Chief";
  const officerRole = caseData.officer?.role || "Police Chief";
  const officerPersona = caseData.officer?.personality || "Gruff";

  const prompt = `
    You are ${officerName}, the ${officerRole}.
    Personality: ${officerPersona}.
    Case: ${caseData.title}.
    Description: ${caseData.description}.
    Evidence Found: ${(evidenceFound || []).map(e => e.title).join(', ')}.
    User asks: "${userMessage}".
    
    Provide a helpful hint, but stay in character. If they are stuck, suggest a suspect to talk to or evidence to look for.
    Keep it under 30 words.
  `;

  const res = await ai.models.generateContent({
    model: GEMINI_MODELS.CHAT,
    contents: prompt
  });
  return res.text!;
};

export const getPartnerIntervention = async (
  type: 'goodCop' | 'badCop' | 'examine' | 'hint',
  suspect: Suspect,
  caseData: CaseData,
  history: ChatMessage[],
  discoveredEvidence: Evidence[] = []
): Promise<string> => {
  console.log(`[Gemini] getPartnerIntervention: ${type} on ${suspect.name}`);
  const lastMsg = history[history.length - 1]?.text || "Hello.";
  const partnerName = caseData.partner?.name || "Partner";
  const partnerRole = caseData.partner?.role || "Detective";
  const partnerPersonality = caseData.partner?.personality || "Helpful";

  let prompt = "";
  if (type === 'examine') {
    prompt = `
        You are ${partnerName}, the ${partnerRole}.
        Action: Perform an initial visual examination of a body (${suspect.name}).
        Generate a 1-2 sentence observation describing ONLY what you physically see.
        Tone: Professional, grim. Speak in first person.
      `;
  } else if (type === 'hint') {
    prompt = `
        You are ${partnerName}, the ${partnerRole}.
        Action: Suggest where the detective should look on the victim's body (${suspect.name}).
        Hidden Evidence they have: ${(suspect.hiddenEvidence || []).map(e => e.title).join(', ')}.
        Generate a 1-sentence hint. Speak in first person.
      `;
  } else {
    const discoveredTitles = new Set(discoveredEvidence.map(e => e.title.toLowerCase()));
    const discoveredEvidenceStr = discoveredEvidence.length > 0 
      ? discoveredEvidence.map(e => `"${e.title}": ${e.description}`).join('; ')
      : 'None yet';

    const unrevealedSecrets = (suspect.hiddenEvidence || []).filter(e => !discoveredTitles.has(e.title.toLowerCase()));
    const secretHint = unrevealedSecrets.length > 0 
      ? unrevealedSecrets[Math.floor(Math.random() * unrevealedSecrets.length)]
      : null;

    const recentContext = history.slice(-6).map(m => {
      if (m.sender === 'player') return `Detective: "${(m.text || '').substring(0, 100)}"`;
      if (m.sender === 'suspect') return `${suspect.name}: "${(m.text || '').substring(0, 100)}"`;
      if (m.sender === 'partner') return `Partner: "${(m.text || '').substring(0, 100)}"`;
      return '';
    }).filter(Boolean).join('\n');

    if (type === 'goodCop') {
      prompt = `
        You are ${partnerName}, the ${partnerRole}.
        Personality: ${partnerPersonality}.
        You are playing GOOD COP — sympathetic, understanding, building rapport.
        Suspect: ${suspect.name} (${suspect.personality}, ${suspect.role}).
        Case: ${caseData.description}
        Evidence found so far: ${discoveredEvidenceStr}
        Recent conversation:
        ${recentContext || 'The interrogation just started.'}
        ${secretHint ? `--- INTERNAL COMPASS (DO NOT reference in dialogue) ---
        The suspect may have hidden knowledge in the area of: "${secretHint.title}".` : ''}
        Generate a 1-2 sentence sympathetic intervention addressed TO the suspect.
        Speak in FIRST PERSON ("I"). Do NOT narrate actions. JUST DIALOGUE.
      `;
    } else {
      prompt = `
        You are ${partnerName}, the ${partnerRole}.
        Personality: ${partnerPersonality}.
        You are playing BAD COP — firm, confrontational, pressing on inconsistencies.
        Suspect: ${suspect.name} (${suspect.personality}, ${suspect.role}).
        Case: ${caseData.description}
        Evidence found so far: ${discoveredEvidenceStr}
        Recent conversation:
        ${recentContext || 'The interrogation just started.'}
        ${secretHint ? `--- INTERNAL COMPASS (DO NOT reference in dialogue) ---
        The suspect may be hiding something in the area of: "${secretHint.title}".` : ''}
        Generate a 1-2 sentence confrontational intervention addressed TO the suspect.
        Speak in FIRST PERSON ("I"). Do NOT narrate actions. JUST DIALOGUE.
      `;
    }
  }

  const res = await ai.models.generateContent({
    model: GEMINI_MODELS.CHAT,
    contents: prompt
  });
  return res.text || "...";
};

export const getBadCopHint = async (suspect: Suspect, unrevealed: Evidence[], responseText: string): Promise<string> => {
  const prompt = `
    You are the partner.
    Suspect: ${suspect.name}.
    Unrevealed Items they have: ${(unrevealed || []).map(e => e.title).join(', ')}.
    
    Suspect just said: "${responseText}".
    
    Did the suspect mention or allude to any of the unrevealed items? 
    If yes, whisper a hint: "Did you hear that? He mentioned [Item]! Press him on it!"
    If no, just say: "He's tough. We need to find a weak spot."
    
    Keep it very short.
  `;
  const res = await ai.models.generateContent({
    model: GEMINI_MODELS.CHAT,
    contents: prompt
  });
  return res.text!;
};
