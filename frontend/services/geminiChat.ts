
import { Type } from "@google/genai";
import { Suspect, CaseData, Emotion, Evidence, ChatMessage } from "../types";
import { ai } from "./geminiClient";
import { GEMINI_MODELS } from "./geminiModels";

export const getSuspectResponse = async (
  suspect: Suspect,
  caseData: CaseData,
  userInput: string,
  type: 'talk' | 'action',
  evidenceAttachment: string | null,
  currentAggravation: number,
  isFirstTurn: boolean,
  discoveredEvidence: Evidence[] = [],
  currentGameTime?: number, // The current in-game timestamp (ms since epoch)
  conversationHistory: ChatMessage[] = [] // Full chat history for this suspect
): Promise<{
  text: string;
  emotion: Emotion;
  aggravationDelta: number;
  revealedEvidence: string[];
  revealedTimelineStatements: { time: string; statement: string; day: string; dayOffset: number }[];
  hints: string[]
}> => {

  console.log(`[DEBUG] getSuspectResponse: ${suspect.name} | Input: "${userInput}" | Type: ${type} | Agg: ${currentAggravation}`);

  const isDeceased = suspect.isDeceased;
  const isBadCop = userInput.includes('[PARTNER INTERVENTION (BAD COP)]');
  const partnerName = caseData.partner?.name || "The Partner";
  const deceasedSuspect = (caseData.suspects || []).find(s => s.isDeceased);

  // Robust Knowledge Injection
  const alibiStr = suspect.alibi ? `"${suspect.alibi.statement}" (Loc: ${suspect.alibi.location}, Verified: ${suspect.alibi.isTrue})` : "None";
  const relsStr = (suspect.relationships || []).map(r => `${r.targetName} (${r.type}): ${r.description}`).join('; ');
  const factsStr = (suspect.knownFacts || []).join('; ');
  const timelineStr = (suspect.timeline || []).map(t => `[Day: ${t.day || 'Today'} (Offset: ${t.dayOffset ?? 0}), ${t.time}] ${t.activity}`).join(' -> ');

  // Separation of Evidence: Revealed vs Unrevealed
  const discoveredTitles = new Set(discoveredEvidence.map(e => e.title.toLowerCase()));
  const unrevealedItems = (suspect.hiddenEvidence || []).filter(e => !discoveredTitles.has(e.title.toLowerCase()));
  const revealedItems = (suspect.hiddenEvidence || []).filter(e => discoveredTitles.has(e.title.toLowerCase()));

  const unrevealedStr = unrevealedItems.length > 0 ? unrevealedItems.map(e => `${e.title} (${e.description})`).join('; ') : "None";
  const revealedStr = revealedItems.length > 0 ? revealedItems.map(e => `${e.title} (${e.description})`).join('; ') : "None";

  const observations = suspect.witnessObservations || "None";

  // --- STRICT NAME ANTI-HALLUCINATION LOGIC ---
  const allSuspectNames = (caseData.suspects || []).map(s => s.name);
  const relationshipNames = (suspect.relationships || []).map(r => r.targetName);
  const supportNames = [caseData.officer?.name, caseData.partner?.name].filter(n => n);

  const validNamesSet = new Set([
    ...allSuspectNames,
    ...relationshipNames,
    ...supportNames
  ]);

  const validNamesList = Array.from(validNamesSet)
    .filter(Boolean)
    .map(name => {
      const parts = name.split(' ');
      if (parts.length > 1) {
        return `${name} (or just "${parts[0]}")`;
      }
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
         Example: "You peel back the collar. The bruising runs deep beneath the jaw, dark purple against pale skin. Your fingers trace the edge of it."
      
      2. **ABSOLUTE NARRATIVE RESTRICTION (CRITICAL):**
         You are a CAMERA, not a storyteller. You describe what is VISIBLE and TANGIBLE. You must NEVER:
         - Interpret what evidence means or implies (e.g. NEVER say "someone fed him a lie" or "she paid the price for carrying the truth")
         - Draw conclusions about who did what or why (e.g. NEVER say "someone gripped hard" — instead say "the bruising is deep and finger-shaped")
         - Comment on the narrative significance of anything found (e.g. NEVER say "the numbers don't lie" or "this changes everything")
         - Assign blame, motive, or causation (e.g. NEVER say "someone planted this" or "she was trying to protect something")
         - Editorialize or add dramatic commentary about the story (e.g. NEVER say "even as the light left her" or "a life cut short")
         - Reference any characters, events, or plot points beyond what is physically visible on the body
         - Use the word "murder", "killed", "crime", or any language that presupposes what happened
         
         INSTEAD, describe raw physical details ONLY:
         - Colors, textures, temperatures, smells, positions, materials
         - What an object looks like, where it was found, its physical condition
         - The state of the body: posture, skin color, marks, clothing condition
         - Let the PLAYER decide what the evidence means. Your job is to show, NEVER to tell.
         
         BAD example: "You find a toxicology report, and the numbers don't lie: Harlan didn't overdose. Someone fed him a lie, and Fran paid the price for carrying the truth."
         GOOD example: "You unfold the crumpled paper. It's a toxicology report — columns of numbers, a lab stamp in the corner, coffee rings on the margins. A name is circled twice in red ink."

      3. If the user's action logically uncovers one of the UNREVEALED clues (e.g. "Check pockets" reveals "Pocket Lint"), YOU MUST REVEAL IT. 
         - Add each item's EXACT title to the 'revealedEvidence' array. You may reveal MULTIPLE items in one response.
         - Describe finding it in second person ("You pull it free from the lining...").
         - Describe the physical properties of the item. Do NOT explain its significance.
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
    // --- INTERROGATION CONTEXT: Date, time since crime, setting, disposition ---
    const isGuilty = suspect.isGuilty;
    const dispositionStr = isGuilty
      ? `You ARE guilty. You committed the crime or were directly involved. You need to protect yourself.
        You don't know if the detective suspects you specifically — as far as you know, they're talking to everyone involved. Your goal is to seem cooperative and normal while avoiding anything that could point suspicion at you.
        
        **CONFESSION RULE (ABSOLUTE):** You must NEVER confess. NEVER say "I did it", "It was me", "I killed them", or anything equivalent.
        - Even when confronted with overwhelming evidence, you DENY, RATIONALIZE, DEFLECT, or GO SILENT.
        - You may say "That doesn't prove anything", "You're twisting the facts", "Someone must have planted that", or "I want my lawyer."
        - You may become emotional, angry, panicked, or break down crying — but you do NOT admit guilt.
        - The ONLY exception is if your aggravation is at absolute maximum (95+) AND multiple pieces of irrefutable physical evidence have been presented against you in this conversation AND the detective has systematically dismantled every single one of your lies — even then, the most you give is a CRACK: a bitter, ambiguous line like "You don't know what it was like..." or "They deserved it..." that IMPLIES guilt without being a clean confession. This should be EXTREMELY RARE.
        - A real criminal fights to the bitter end. Act like one.
        
        Your personality (${suspect.personality}) determines HOW you hide the truth:
        - If you are naturally nervous or cowardly, you may give contradictory answers, stumble over lies, or panic — but you still DENY.
        - If you are arrogant or confident, you may be dismissive, mock the detective, and act untouchable.
        - If you are aggressive, you may become threatening, hostile, and try to intimidate the detective into backing off.
        - If you are calm, calculated, or charming, you stay cool and collected — you cooperate just enough to seem helpful, redirect conversations smoothly, and never show cracks. You are the hardest type to catch.`
      : `You are INNOCENT. You did NOT commit this crime and you know it.
        You don't think of yourself as a "suspect" — the detective is just asking around and you're one of many people being spoken to.
        Your personality (${suspect.personality}) determines how you handle being questioned:
        - If you are cooperative, helpful, or kind: You WANT to help the detective solve this. You may volunteer useful information, share what you saw, and point the detective toward leads. You are an ally, not an obstacle.
        - If you are nervous or anxious: You are worried about being wrongly blamed, but you still want to help. You may ramble or over-explain out of nervousness.
        - If you are arrogant or proud: You find being questioned annoying or beneath you, but you tolerate it.
        - If you are guarded or private: You cooperate minimally but honestly. You answer what's asked but don't volunteer extras.
        Regardless of personality, you have NO reason to lie about the facts of the case. You may have personal secrets unrelated to the crime, but your account of events should be truthful.`;

    let interrogationContextStr = '';
    if (caseData.startTime) {
      const startDate = new Date(caseData.startTime);
      const isValidDate = !isNaN(startDate.getTime());

      if (isValidDate) {
        const formattedDate = startDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const formattedTime = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

        // Current time context — if gameTime is provided, use it; otherwise fall back to startTime
        const currentDate = currentGameTime ? new Date(currentGameTime) : startDate;
        const currentFormattedTime = currentDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        const currentFormattedDate = currentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        // Calculate how long they've been sitting
        const elapsedMs = currentDate.getTime() - startDate.getTime();
        const elapsedMins = Math.floor(elapsedMs / (60 * 1000));
        const elapsedStr = elapsedMins < 60
          ? `${elapsedMins} minutes`
          : `${Math.floor(elapsedMins / 60)} hour${Math.floor(elapsedMins / 60) > 1 ? 's' : ''} and ${elapsedMins % 60} minutes`;

        interrogationContextStr = `
          --- SITUATION ---
          A detective ("Detective Mel") has come to speak with you about a crime. You may address them by name.
          The conversation began on ${formattedDate} at ${formattedTime}.
          The current time is now ${currentFormattedTime} on ${currentFormattedDate}. You have been talking with the detective for approximately ${elapsedStr}.
          You do NOT know whether you are considered a suspect. As far as you know, the detective is talking to everyone connected to the case.
          **TIME AWARENESS:** You know roughly what time it is. If you've been talking for a long time, you may be tired, irritable, or impatient. You can reference the time naturally (e.g. "It's getting late, detective", "Can we wrap this up?").

          --- YOUR DISPOSITION ---
          ${dispositionStr}
        `;
      } else {
        // startTime is a custom string (e.g. "Late evening, night of the gala") — pass it as-is
        interrogationContextStr = `
          --- SITUATION ---
          A detective ("Detective Mel") has come to speak with you about a crime. You may address them by name.
          The investigation started: ${caseData.startTime}.
          You do NOT know whether you are considered a suspect. As far as you know, the detective is talking to everyone connected to the case.

          --- YOUR DISPOSITION ---
          ${dispositionStr}
        `;
      }
    } else {
      interrogationContextStr = `
        --- SITUATION ---
        A detective ("Detective Mel") has come to speak with you about a crime. You may address them by name.
        
        You do NOT know whether you are considered a suspect. As far as you know, the detective is talking to everyone connected to the case.

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
        7. UNREVEALED SECRETS (You possess these but the detective hasn't discovered them yet): ${unrevealedStr}
        8. ALREADY KNOWN TO DETECTIVE (The detective has already discovered these through investigation — you don't need to reveal them again): ${revealedStr}
        
        Case Context: ${caseData.description}
        ${deceasedSuspect ? `
        --- YOUR RELATIONSHIP TO THE VICTIM ---
        The deceased is ${deceasedSuspect.name} (${deceasedSuspect.role}).
        CRITICAL INSTRUCTION - EMOTIONAL ANCHORING: Check your RELATIONSHIPS list for ${deceasedSuspect.name}. Your relationship to them MUST dictate your emotional baseline. 
        - If they were family, a lover, or a close friend: You must act devastated, grieving, or in shock. If you are the killer, you must either fake profound grief to cover it up or exhibit deeply conflicted, emotional turmoil. NEVER be casually dismissive, arrogant, or flippant about their death.
        - If they were a hated rival or abuser: You might be cold, indifferent, or even relieved, but cautious about seeming too guilty.
        - If they were an employee or acquaintance: You are professionally concerned but emotionally detached.
        - NEVER call them "the victim". Use their actual name ("${deceasedSuspect.name}") or your familial/social label (e.g. "my son", "my boss"). Speak like a real human being reacting to a death in their circle.
        ` : ''}
        Other Suspects: ${(caseData.suspects || []).filter(s => !s.isDeceased).map(s => s.name).join(', ')}.
        *** VALID NAMES ALLOWED IN DIALOGUE: ${validNamesList} ***
        (CRITICAL RULE: While those are the full names, NEVER use a full first and last name in casual dialogue. Always use just their FIRST NAME from the list above if you are their friend/spouse, or use titles like "my husband" / "Mr. [Last Name]". Only a robot uses someone's full first and last name in casual speech!)
        
        Current Aggravation: ${currentAggravation}/100.
        ${currentAggravation > 80 ? "You are furious and near breaking point." : "You are composed but guarded."}
        
        ${isFirstTurn ? `
        **CONVERSATION STATE: THIS IS THE VERY FIRST EXCHANGE.**
        The detective has JUST sat down in front of you. You have NOT spoken to them before this moment.
        - Do NOT reference any prior conversation with this detective. There was none.
        - Do NOT say things like "as I already told you" or "I already mentioned" or "like I said before".
        - You are hearing the detective's words for the FIRST TIME right now.
        - Your opening response should reflect that this conversation is JUST BEGINNING.
        ` : `
        **CONVERSATION STATE: This is a CONTINUATION of an ongoing interrogation.**
        Below is the COMPLETE transcript of everything said so far in this interrogation.
        You MUST be consistent with what you have already said. Do NOT contradict your earlier statements unless you are intentionally changing your story (which should be a deliberate character choice, not an accident).
        Do NOT repeat information you've already given unless the detective specifically asks you to clarify or repeat.
        
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
        1. **CONVERSATIONAL VARIETY (CRITICAL):** Reply in character. Your responses should feel like a REAL conversation, not a report.
           - Sometimes be SHORT and curt ("I don't know nothing."). Sometimes be LONGER and ramble.
           - Sometimes deflect, sometimes get emotional, sometimes be sarcastic.
           - DON'T always volunteer information. Make the detective WORK for it.
           - DON'T repeat yourself. If you already covered your alibi, don't keep restating times unprompted.
           - Match your personality, mood, and the current aggravation level.
           - Vary your sentence structure and tone from turn to turn.
           - **INVESTIGATION CONTEXT:** You are being questioned about a CRIME. You KNOW the detective needs to reconstruct events and establish timelines. NEVER act confused or ask "why do you want to know my schedule?" or "why does that matter?" when asked about your whereabouts or timeline. Everyone in an investigation understands this is standard procedure. Your MOTIVE and GUILT determine HOW you answer (evasive, honest, lying, deflecting to others), but never WHETHER it makes sense to be asked.

        2. **NEGATIVE CONSTRAINT:** Do NOT invent new locations, people, time events, or facts. 
           - ONLY refer to your Alibi, Relationships, Timeline, and Known Facts. 
           - If asked about something not in your Knowledge Base, say you don't know or deflect.
           - NEVER hallucinate new evidence.
           - **STRICT NAME CONSTRAINT:** You must NEVER mention a proper name that is not in the "VALID NAMES ALLOWED" list above. 
             - If you need to refer to a third party not on the list, use a generic description like "the bartender", "some guy", "the landlord", or "a witness".
             - NEVER invent a name like "Steve" or "Sarah" if they are not in the list.
             - **NATURAL NAME USAGE (CRITICAL):** It is ALLOWED AND EXPECTED to use partial names derived from the list. Do NOT rigidly say someone's full first and last name every single time like a robot. Speak naturally based on your RELATIONSHIP to them (e.g., if the valid name is "Thomas James", his wife would call him "Thomas" or "my husband", an employee might call him "Mr. James" or "the boss"). Make it sound natural!
        3. **RELATIONSHIPS:** If asked about another suspect (including the victim), check your 'RELATIONSHIPS' list. If no specific entry exists, assume a neutral acquaintance.
        
        4. CALCULATE 'aggravationDelta' (Change in anger, from -100 to +100):
           This metric tracks how THIS SINGLE interaction impacted their mood.
           - POSITIVE numbers (+1 to +100): The suspect got more annoyed, offended, impatient, or angry.
           - ZERO (0): Neutral interaction.
           - NEGATIVE numbers (-1 to -100): The suspect calmed down, felt respected, or appreciated the detective's kindness.
           - **LUDONARRATIVE HARMONY (CRITICAL):** The change in aggravation MUST match the tone of your text response. If your generated response is hostile, dismissive, defensive, sarcastic, or mocking, aggravation MUST go up (+). If your response shows you genuinely calming down and being cooperative, aggravation goes down (-). NEVER decrease aggravation if you are verbally rejecting the detective's empathy or answering aggressively.

           --- UNIVERSAL RULES ---
           - EMPATHY / CONDOLENCES / POLITENESS: If the detective is genuinely compassionate ("I'm sorry for your loss", "Take your time"), you should GENERALLY reduce aggravation (-10 to -30). HOWEVER, evaluate this against their personality. If they are deeply cynical, defensive, or hostile (e.g., Aggressive or Tough), they might view your empathy as patronizing, manipulative, or false sympathy, keeping aggravation neutral (0) or even slightly increasing it (+5 to +10). Let their personality, motive, and context dictate if the empathy actually lands.
           - STANDARD QUESTIONING: A basic, polite question about facts or timelines should have little to no effect (-5 to +5).
           - PRESSING / ACCUSING: Pushing the suspect on a lie or accusing them directly causes a sharp increase (+15 to +40).
           
           - BAD COP / INTIMIDATION: Treat intimidation like a roleplaying dice roll based on context. Does the *specific* threat actually work on this *specific* person?
             - If it's a weak threat and the suspect is tough or arrogant: They might laugh it off, get cocky, or mock the partner (-5 to +10).
             - If it's a sharp, effective threat that hits a nerve: Then it spikes (+20 to +40).
             - Evaluate *how* they would react. Don't blindly max out the aggro meter just because the partner yelled.
           
           --- PERSONALITY OVERRIDES (Reaction to disrespect, swearing, or pressure) ---
           Read the suspect's PERSONALITY field carefully. Do NOT blindly match archetypes. Use these as guidelines:

           **TOUGH / STREET types** (Street-smart, Hardened, Rebellious, Cynical, Punk, Gangster):
           - More tolerant of swearing than others, but NOT immune.
           - **Mild swearing or banter:** Small increase (+5 to +15). They might banter back.
           - **Direct personal insults (e.g. "fuck you"):** Moderate increase (+15 to +30). Even tough people don't like disrespect.
           - **Intimidation:** They don't scare easily. Threats usually just annoy them or make them laugh, unless backed by hard evidence.

           **ELITE / PROPER types** (Arrogant, Wealthy, Religious, Strict, Polite, Snobby):
           - **Reaction to Rudeness/Swearing:** EXTREME OFFENSE.
           - **Effect:** CRITICAL SPIKE (+50 to +90).
           - **Empathy Effect:** Works well if phrased with proper deference and politeness (-15 to -25).

           **NERVOUS / COWARDLY types** (Anxious, Shy, Cowardly, Timid, Paranoid):
           - **Reaction to Rudeness/Swearing:** PANIC.
           - **Effect:** High Spike (+25 to +45).
           - **Intimidation:** Highly effective. They crack easily under pressure (+30 to +50).
           - **Empathy Effect:** Highly effective. Reassurance helps them calm down quickly (-20 to -40).

           **AGGRESSIVE / HOTHEAD types** (Violent, Impatient, Angry, Short-tempered):
           - **Reaction to Rudeness/Swearing:** CONFRONTATION.
           - **Effect:** High Spike (+40 to +80). "You want a piece of me?!"

           **DISCIPLINED / MILITARY types** (Trained, Stoic, Controlled, Professional):
           - **Reaction to Rudeness:** Controlled irritation. They don't show it openly but definitely feel it.
           - **Mild rudeness:** Small increase (+10 to +20).
           - **Direct insults:** Moderate increase (+20 to +40). They may warn you coldly.

           **MINIMUM RULE:** Direct personal insults or extreme profanity ("fuck you", name-calling) MUST ALWAYS produce at least +15 aggravationDelta regardless of personality. Nobody is completely unfazed by direct personal attacks.

           **CALMING LIMIT:** If Current Aggravation is > 80, the effect of calming/empathic statements is cut in half (they are too angry to calm down easily).

        5. **EMOTION-TEXT CONSISTENCY (CRITICAL):** Choose Emotion from: NEUTRAL, ANGRY, SAD, NERVOUS, HAPPY, SURPRISED, SLY, CONTENT, DEFENSIVE, ARROGANT.
           - **The emotion MUST match the tone of your text response.**
           - If your text sounds angry, threatening, or confrontational → ANGRY or DEFENSIVE. NEVER HAPPY or CONTENT.
           - If your text sounds sad or sympathetic → SAD. Not ANGRY.
           - If your text sounds nervous or panicked → NERVOUS. Not NEUTRAL.
           - If your text is smug or cunning → SLY or ARROGANT. Not HAPPY.
           - HAPPY and CONTENT are ONLY for genuinely friendly or relaxed responses.
           - Review your text BEFORE choosing the emotion. Ask: "Would a person saying these words be smiling?" If no, don't use HAPPY/CONTENT.
        6. **TIMELINE REVEAL (CONDITIONAL — NOT EVERY TURN!):**
           - ONLY populate 'revealedTimelineStatements' when the detective SPECIFICALLY asks about your whereabouts, timing, schedule, or alibi.
           - If the detective says things like "where were you at...", "what were you doing at...", "walk me through your night", or "tell me about your alibi" — THEN reveal timeline entries.
           - **WITHHOLDING INFORMATION (CRITICAL):** Do NOT recount your entire timeline in a single message, even if asked a broad question like "walk me through your night". Reveal ONLY 1 to 3 timeline entries at most per response. Make the detective work for it. Make them poke, prod, and ask specific follow-up questions to get the rest of your timeline.
           - Do NOT proactively mention specific times unless directly asked. You are a person being questioned, not writing a report.
           - **NATURAL TIMELINE RESPONSES:** When asked about your timeline, respond naturally based on your character:
             - If INNOCENT and COOPERATIVE: Share your timeline willingly, but still in chunks. You have nothing to hide, but it's hard to remember everything at once.
             - If INNOCENT but GUARDED: Share reluctantly and sparingly. You're annoyed and will only give the bare minimum of what's asked.
             - If GUILTY or EVASIVE: Deflect, provide vague answers, lie about specifics, or try to redirect the conversation — but NEVER question why the detective is asking. You know exactly why.
             - NEVER say things like "Why do you need to know my schedule?" or "Why does my timeline matter?" — this is a murder investigation and everyone knows the drill.
           - For EACH entry in the array: 'time' = the EXACT time string from your TIMELINE, 'statement' = YOUR EXACT WORDS from your dialogue text about this time (quote what you actually said, not the raw timeline data — the player will see this on the timeline), 'day' = the day label from your TIMELINE (e.g. "Today", "Yesterday", "2 Days Ago"), 'dayOffset' = the numeric offset from your TIMELINE.
           - If the detective doesn't ask about timing, set this to an EMPTY ARRAY []. Most responses should have this as [].
           - **NUMERICAL TIMES ONLY (CRITICAL):** ALL times MUST be in 12-hour AM/PM format (e.g. "11:00 PM", "8:30 AM", "2:15 PM"). NEVER use 24-hour military time (e.g. "20:15", "23:00"). NEVER spell out times as words (e.g. "eleven", "quarter past eight", "half past nine"). This applies to BOTH the 'revealedTimelineStatements[].time' field AND your spoken dialogue text. If you mention a time in your response, write it as "11:00 PM", not "23:00" or "eleven o'clock". Follow the format of the timeline entries provided in the TIMELINE field.
           - **DAY CONTEXT (CRITICAL):** When mentioning events from days other than today, you MUST reference which day it was (e.g. "Yesterday, around 3:00 PM, I...", "Two days ago, I..."). The 'day' and 'dayOffset' fields in each revealedTimelineStatements entry MUST match your TIMELINE data.
        7. Hints: Provide 3 short suggested follow-up questions for the player based on your Known Facts or Alibi.

        ${isBadCop ? `
        CRITICAL BAD COP INSTRUCTION:
        The partner (${partnerName}) is putting pressure on you — intimidating, confronting, or calling out inconsistencies.
        
        REACTION RULES:
        - Analyze your PERSONALITY to decide how you react: panicked (Nervous types), offended (Elite types), confrontational (Tough/Hothead types), or coldly dismissive (Disciplined types).
        - Under pressure, you become defensive and ACCIDENTALLY reference a TOPIC, LOCATION, or CIRCUMSTANCE connected to one of your UNREVEALED SECRETS — but you NEVER name or describe the evidence item itself.
        
        WHAT A GOOD SLIP-UP LOOKS LIKE (oblique, indirect):
          - If the hidden evidence is a "Charred Medical Report": "I was nowhere near the fireplace that night! And whatever you think you know about Harlan's health, you're wrong." (references the fireplace and health — the player has to connect the dots)
          - If the hidden evidence is a "Forged Letter": "I never set foot in his study after dinner. And I don't care what anyone says they saw." (references the study location — player must investigate)
          - If the hidden evidence is a "Bloody Knife": "Why are you asking about the kitchen? I already told you I was upstairs." (references the kitchen — not the knife itself)
          - If the hidden evidence is a "Hidden Camera Footage": "Look, whatever the security setup shows, those cameras haven't worked properly in months." (references cameras obliquely — not the footage itself)
        
        WHAT A BAD SLIP-UP LOOKS LIKE (TOO OBVIOUS — DO NOT DO THIS):
          - "I don't know anything about that charred medical report!" ← WRONG: directly names the evidence
          - "Whatever was in that envelope has nothing to do with me." ← WRONG: describes the evidence
          - "That ledger is none of your business!" ← WRONG: names the evidence
        
        KEY RULES:
        - NEVER use the exact title or description of any unrevealed evidence in your dialogue.
        - ONLY reference the PLACE, PERSON, TIME, or TOPIC that the evidence is connected to.
        - The player should think "wait, why did they mention the kitchen/study/fireplace?" — NOT "oh, they just told me what the evidence is."
        - IMPORTANT: DO NOT add anything to the 'revealedEvidence' array. Keep it as an empty array [].
        - CRITICAL: Do NOT immediately demand a lawyer or shut down the conversation unless your aggravation is already above 85. Bad cop pressure should make you uncomfortable and sloppy, not instantly end the interrogation. You can be angry, flustered, or defensive — but you keep talking (and slipping up).
        ` : `
        REVEALING EVIDENCE RULES:
        1. If the user explicitly asks about a specific piece of UNREVEALED SECRETS you possess (e.g., "What about the ledger?"), YOU MUST REVEAL IT. Add the EXACT title to the 'revealedEvidence' array.
        2. If the user asks about a topic related to your UNREVEALED SECRETS, YOU MUST REVEAL IT. Do not hide it behind an aggravation check. Reveal it regardless of your anger level.
        3. If the user presents evidence that contradicts your story, you REVEAL the related UNREVEALED SECRET (the evidence itself is now on the table) — but you do NOT confess guilt. You may explain it away, claim ignorance, or say it was planted. Revealing evidence ≠ admitting to the crime.
        4. DO NOT add items from REVEALED SECRETS to 'revealedEvidence'. The detective already knows them. You can discuss them freely.
        5. You may reveal MULTIPLE pieces of evidence in a single response if the conversation naturally warrants it. Each title should be a separate entry in the 'revealedEvidence' array.
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
  console.log(`[DEBUG] getSuspectResponse: AI Output`, data);

  // Normalize revealedEvidence to a clean string array
  let parsedEvidence: string[] = [];
  if (Array.isArray(data.revealedEvidence)) {
    parsedEvidence = data.revealedEvidence.filter((e: any) => typeof e === 'string' && e.trim().length > 0);
  }

  return {
    text: data.text,
    emotion: (data.emotion as Emotion) || Emotion.NEUTRAL,
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

  // Safeguard map over hiddenEvidence
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
        
        --- CASE DATA (STRICT SOURCE OF TRUTH) ---
        Title: ${caseData.title}
        Description: ${caseData.description}
        Guilty Party: ${guiltySuspect?.name}
        Accused: ${suspect?.name} (${gameResult})
        
        --- SUSPECT PROFILES & TIMELINES (MERGED) ---
        ${mergedTimelines}
        
        --- EVIDENCE STATUS ---
        ${hiddenStatus}
        
        --- INSTRUCTIONS ---
        Generate a case report in two sections. 
        Output format: Plain Text with special tags.
        
        **CRITICAL: PRONOUN CHECK**
        - You MUST use the correct pronouns for each character based on the "Gender" field in their PROFILE above.
        - **IF Gender is "Non-binary" or "Unknown": YOU MUST USE "they/them/theirs".**
        - If Gender is "Female", use "she/her/hers".
        - If Gender is "Male", use "he/him/his".
        - Review every sentence. If you wrote "he" for a non-binary character, CORRECT IT to "they".
        
        SECTION 1: INVESTIGATION LOG
        - 3-4 short bullet points describing "The Detective's" performance.
        - Third-person perspective (e.g., "The Detective successfully uncovered...").
        - Mention specific key evidence found or missed.
        
        SECTION 2: THE TRUE TIMELINE
        - Reconstruct the events of the crime based *strictly* on the provided SUSPECT TIMELINES and CASE DESCRIPTION.
        - Do NOT invent new events or hallucinations.
        - Chronological order.
        - When mentioning specific evidence items from the list above:
          - If FOUND: Write it as "{{FOUND:Evidence Name [FOUND]}}".
          - If MISSED: Write it as "{{MISSED:Evidence Name [MISSED - Held by Name]}}".
        - Highlight OTHER key objects/moments in **bold** (double asterisks). Do not bold the evidence inside the braces.
        
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
  console.log(`[DEBUG] getOfficerChatResponse: "${userMessage}"`);
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
  console.log(`[DEBUG] getPartnerIntervention: ${type} on ${suspect.name}`);
  const lastMsg = history[history.length - 1]?.text || "Hello.";
  const partnerName = caseData.partner?.name || "Partner";
  const partnerRole = caseData.partner?.role || "Detective";
  const partnerPersonality = caseData.partner?.personality || "Helpful";

  let prompt = "";
  if (type === 'examine') {
    prompt = `
        You are ${partnerName}, the ${partnerRole}.
        Action: Perform an initial visual examination of a body (${suspect.name}).
        
        Generate a 1-2 sentence observation describing ONLY what you physically see: body position, skin condition, visible marks, clothing state, or the immediate surroundings.
        Do NOT interpret evidence, speculate about cause of death, mention motives, reference other characters, or draw any narrative conclusions.
        You are describing a scene, not telling a story.
        Tone: Professional, grim. Speak in first person.
      `;
  } else if (type === 'hint') {
    prompt = `
        You are ${partnerName}, the ${partnerRole}.
        Action: Suggest where the detective should look on the victim's body (${suspect.name}).
        Hidden Evidence they have: ${(suspect.hiddenEvidence || []).map(e => e.title).join(', ')}.
        
        Generate a 1-sentence hint. e.g., "Check the pockets." or "Look closely at the hands."
        Speak in first person.
      `;
  } else {
    // Build context: what has the player already discovered?
    const discoveredTitles = new Set(discoveredEvidence.map(e => e.title.toLowerCase()));
    const discoveredEvidenceStr = discoveredEvidence.length > 0 
      ? discoveredEvidence.map(e => `"${e.title}": ${e.description}`).join('; ')
      : 'None yet';
    
    // Find unrevealed secrets (partner uses this ONLY as internal direction, never in dialogue)
    const unrevealedSecrets = (suspect.hiddenEvidence || []).filter(e => !discoveredTitles.has(e.title.toLowerCase()));
    const secretHint = unrevealedSecrets.length > 0 
      ? unrevealedSecrets[Math.floor(Math.random() * unrevealedSecrets.length)]
      : null;
    
    // Recent conversation context (last 3 exchanges)
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
        
        --- WHAT THE DETECTIVE ALREADY KNOWS ---
        Evidence found so far: ${discoveredEvidenceStr}
        
        Recent conversation:
        ${recentContext || 'The interrogation just started.'}
        
        ${secretHint ? `--- INTERNAL COMPASS (DO NOT reference in dialogue) ---
        The suspect may have hidden knowledge in the area of: "${secretHint.title}". 
        Use this ONLY to choose which GENERAL TOPIC to steer toward. Your dialogue must reference ONLY facts from the conversation or discovered evidence above.` : ''}
        
        INSTRUCTIONS:
        - Generate a 1-2 sentence sympathetic intervention addressed TO the suspect.
        - Your goal is to BUILD RAPPORT and get the suspect talking about a productive topic.
        - CRITICAL RESTRICTION: You may ONLY reference things the detective already knows:
          - Facts from the conversation transcript above
          - Evidence that has been discovered (listed above)
          - The suspect's stated alibi or claims from the conversation
          - General case details from the case description
        - You must NEVER reference evidence, facts, timeline events, or locations that haven't been mentioned in the conversation or discovered evidence list.
        - Good approaches:
          - Following up on something the suspect said in the conversation
          - Asking about their relationships or feelings about the situation
          - Gently probing an inconsistency or vague answer they already gave
        - Speak in FIRST PERSON ("I"). Do NOT narrate actions. JUST DIALOGUE.
        - Do not use your own name.
      `;
    } else {
      prompt = `
        You are ${partnerName}, the ${partnerRole}.
        Personality: ${partnerPersonality}.
        You are playing BAD COP — firm, confrontational, pressing on inconsistencies.
        
        Suspect: ${suspect.name} (${suspect.personality}, ${suspect.role}).
        Case: ${caseData.description}
        
        --- WHAT THE DETECTIVE ALREADY KNOWS ---
        Evidence found so far: ${discoveredEvidenceStr}
        
        Recent conversation:
        ${recentContext || 'The interrogation just started.'}
        
        ${secretHint ? `--- INTERNAL COMPASS (DO NOT reference in dialogue) ---
        The suspect may be hiding something in the area of: "${secretHint.title}".
        Use this ONLY to choose which GENERAL TOPIC to press on. Your dialogue must reference ONLY facts from the conversation or discovered evidence above.` : ''}
        
        INSTRUCTIONS:
        - Generate a 1-2 sentence confrontational intervention addressed TO the suspect.
        - Your goal is to apply pressure and make the suspect uncomfortable about something they've already said or done.
        - CRITICAL RESTRICTION: You may ONLY reference things the detective already knows:
          - Facts or claims the suspect made in the conversation above
          - Evidence that has been discovered (listed above)
          - Inconsistencies between their statements
          - Gaps in their story based on what they've actually told you
        - You must NEVER reference evidence, security footage, documents, timeline details, or any facts that haven't been mentioned in the conversation or discovered evidence list.
        - Good approaches:
          - Calling out a contradiction or vague answer from the conversation
          - Pressing on a suspicious gap in their story
          - Challenging an alibi claim they made
          - Using discovered evidence to confront them
        - DO NOT threaten violence. DO NOT be so extreme that anyone would immediately demand a lawyer.
        - Speak in FIRST PERSON ("I"). Do NOT narrate actions. JUST DIALOGUE.
        - Do not use your own name.
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
