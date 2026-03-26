
import { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { GameState, ScreenState, ChatMessage, Emotion, CaseData, Evidence } from '../types';
import { getSuspectResponse, getOfficerChatResponse, getBadCopHint, getPartnerIntervention } from '../services/geminiService';
import { generateTTS } from '../services/geminiTTS';
import { formatTime, TIME_INCREMENT_MS, WAIT_THRESHOLD_MS, DEFAULT_SUGGESTIONS } from '../utils/timeUtils';
import { normalizeTimeString, matchNormalizedTimeToTimeline, textHasAnyTimeReference, extractTimelineFromText } from '../utils/timelineExtraction';
import { parseRevealedEvidenceForCollection } from '../utils/evidenceRevealParsing';
import { resolveVictimExaminationPortraitKey } from '../utils/victimPortraitKeys';

interface UseGameActionsParams {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  findCaseById: (caseId: string | null | undefined) => CaseData | undefined;
  isMuted: boolean;
  setCurrentSuggestions: React.Dispatch<React.SetStateAction<(string | { label: string; text: string })[]>>;
  setUnreadSuspects: React.Dispatch<React.SetStateAction<Map<string, number>>>;
  setNewTimelineIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setNewEvidenceTitles: React.Dispatch<React.SetStateAction<Set<string>>>;
  thinkingSuspectIds: Set<string>;
  setThinkingSuspectIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export const useGameActions = ({
  gameState,
  setGameState,
  findCaseById,
  isMuted,
  setCurrentSuggestions,
  setUnreadSuspects,
  setNewTimelineIds,
  setNewEvidenceTitles,
  thinkingSuspectIds,
  setThinkingSuspectIds,
}: UseGameActionsParams) => {
  const actionInProgressRef = useRef(false);

  const selectCase = (caseInput: string | CaseData, communityCases: CaseData[], localDrafts: CaseData[], draftCase: CaseData | null) => {
    console.log('[DEBUG] selectCase:', typeof caseInput === 'string' ? caseInput : caseInput.title);
    let selectedCase: CaseData | undefined;
    if (typeof caseInput === 'string') {
        selectedCase = findCaseById(caseInput);
    } else {
        selectedCase = caseInput;
    }
    if (!selectedCase) return;

    const initialAggravation: Record<string, number> = {};
    const initialNotes: Record<string, string[]> = {};
    const initialHistory: Record<string, ChatMessage[]> = {};
    const initialEmotions: Record<string, Emotion> = {};
    const initialTurnIds: Record<string, string | undefined> = {};
    const initialInteractionTimes: Record<string, number> = {};
    
    selectedCase.suspects.forEach(s => {
      initialAggravation[s.id] = s.baseAggravation;
      initialNotes[s.id] = [];
      initialHistory[s.id] = [];
      initialEmotions[s.id] = Emotion.NEUTRAL;
      initialTurnIds[s.id] = undefined; 
    });

    const officerName = selectedCase.officer?.name || "The Chief";
    const officerGreeting = `This is ${officerName}. I'm busy, so make it quick. What do you have?`;

    const { INITIAL_TIME_MS } = require('../utils/timeUtils');
    const parsedStartMs = selectedCase.startTime ? new Date(selectedCase.startTime).getTime() : NaN;
    const caseStartTime = !isNaN(parsedStartMs) ? parsedStartMs : INITIAL_TIME_MS;

    setGameState(prev => ({
      ...prev,
      currentScreen: ScreenState.CASE_HUB,
      selectedCaseId: selectedCase!.id,
      currentSuspectId: null,
      aggravationLevels: initialAggravation,
      notes: initialNotes,
      evidenceDiscovered: [...selectedCase!.initialEvidence],
      timelineStatementsDiscovered: (selectedCase!.initialTimeline || []).map((t, i) => ({
        id: `initial-ts-${i}`,
        suspectId: 'system',
        suspectName: 'POLICE REPORT',
        time: t.time,
        statement: t.activity || (t as any).statement || '',
        day: t.day || 'Today',
        dayOffset: t.dayOffset ?? 0
      })),
      chatHistory: initialHistory,
      officerHistory: [{ sender: 'officer', text: officerGreeting, timestamp: formatTime(caseStartTime) }],
      suspectEmotions: initialEmotions,
      partnerEmotion: Emotion.NEUTRAL,
      suspectTurnIds: initialTurnIds,
      officerHintsRemaining: 10,
      currentOfficerHint: null,
      sidekickComment: `I'm ready to back you up, Detective. I've got ${selectedCase!.partnerCharges ?? 3} moves I can pull if things get hairy.`,
      partnerCharges: selectedCase!.partnerCharges ?? 3,
      winner: null,
      accusedSuspectId: null,
      gameTime: caseStartTime,
      lastInteractionTimes: initialInteractionTimes,
      suspectSuggestions: {}
    }));

    setCurrentSuggestions(DEFAULT_SUGGESTIONS);
  };

  const startInterrogation = (suspectId: string) => {
    const { gameTime, lastInteractionTimes, aggravationLevels, chatHistory, selectedCaseId, suspectSuggestions } = gameState;
    const currentCase = findCaseById(selectedCaseId)!;
    const suspect = currentCase.suspects.find(s => s.id === suspectId)!;
    
    let newAgg = aggravationLevels[suspectId] || 0;
    let newHistory = chatHistory[suspectId] || [];
    let updatedInteractionTimes = { ...lastInteractionTimes };

    if (!suspect.isDeceased) {
        const lastSeen = lastInteractionTimes[suspectId];
        
        if (lastSeen !== undefined) {
            const diffMs = gameTime - lastSeen;
            
            if (diffMs > WAIT_THRESHOLD_MS) {
                const hours = Math.floor(diffMs / (60 * 60 * 1000));
                const mins = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
                const penalty = 5 + Math.floor(diffMs / (60 * 60 * 1000)) * 5;
                
                newAgg = Math.min(100, newAgg + penalty);
                
                const timeStr = hours > 0 ? `${hours} hour${hours > 1 ? 's' : ''}` : `${mins} mins`;
                
                newHistory = [...newHistory, {
                    sender: 'system',
                    text: `[SYSTEM] Subject is annoyed. You kept them waiting for ${timeStr}. (+${penalty}% Aggravation)`,
                    timestamp: formatTime(gameTime)
                }];
            }
            updatedInteractionTimes[suspectId] = gameTime;
        }
    }

    const savedSuggestions = suspectSuggestions[suspectId];
    if (savedSuggestions && savedSuggestions.length > 0) {
        setCurrentSuggestions(savedSuggestions);
    } else {
        setCurrentSuggestions(DEFAULT_SUGGESTIONS);
    }

    setGameState(prev => ({
      ...prev,
      currentScreen: ScreenState.INTERROGATION,
      currentSuspectId: suspectId,
      sidekickComment: prev.sidekickComment,
      aggravationLevels: { ...prev.aggravationLevels, [suspectId]: newAgg },
      chatHistory: { ...prev.chatHistory, [suspectId]: newHistory },
      lastInteractionTimes: updatedInteractionTimes
    }));
  };

  /**
   * Processes timeline entries from a suspect response and appends new discoveries.
   * Shared between handleSendMessage and handlePartnerAction.
   */
  const processTimelineEntries = (
    response: { text: string; revealedTimelineStatements: { time: string; statement: string; day: string; dayOffset: number }[] },
    suspect: { id: string; name: string; timeline?: { time: string; activity: string; day: string; dayOffset: number }[]; portraits?: Record<string, string> },
    currentSuspectId: string,
    newAgg: number,
    existingTimeline: GameState['timelineStatementsDiscovered'],
    debugLabel: string
  ) => {
    const newTimelineStatements = [...existingTimeline];
    
    // Trust AI-provided timeline entries; normalize spelled-out times
    let timelineEntries = response.revealedTimelineStatements
      .filter(e => e && e.time)
      .map(e => ({ ...e, time: normalizeTimeString(e.time) }));
    timelineEntries = timelineEntries.map(e => {
      const canonicalTime = matchNormalizedTimeToTimeline(e.time, suspect.timeline || []);
      return canonicalTime ? { ...e, time: canonicalTime } : e;
    });
    if (timelineEntries.length > 0 && !textHasAnyTimeReference(response.text)) {
      console.log(`[DEBUG] Rejecting AI timeline (${debugLabel}) — no time reference in text`, timelineEntries);
      timelineEntries = [];
    }
    if (timelineEntries.length === 0 && newAgg < 100) {
      timelineEntries = extractTimelineFromText(response.text, suspect.timeline || []);
      if (timelineEntries.length > 0) {
        console.log(`[DEBUG] Timeline Statements (${debugLabel} FALLBACK):`, timelineEntries);
      }
    }
    if (newAgg < 100) {
      for (let i = 0; i < timelineEntries.length; i++) {
        const entry = timelineEntries[i];
        const alreadyExists = newTimelineStatements.some(ts => 
          ts.suspectId === currentSuspectId && 
          ts.time === entry.time &&
          ts.day === (entry.day || 'Today')
        );
        if (!alreadyExists) {
          const tsId = `ts-${Date.now()}-${i}`;
          newTimelineStatements.push({
            id: tsId,
            suspectId: currentSuspectId,
            suspectName: suspect.name,
            suspectPortrait: suspect.portraits?.[Emotion.NEUTRAL] || undefined,
            time: entry.time,
            statement: entry.statement,
            day: entry.day || 'Today',
            dayOffset: entry.dayOffset ?? 0
          });
          setNewTimelineIds(prev => new Set(prev).add(tsId));
        }
      }
    }

    return newTimelineStatements;
  };

  const handlePartnerAction = async (action: 'goodCop' | 'badCop' | 'examine' | 'hint') => {
      console.log('[DEBUG] handlePartnerAction:', action);
      if (actionInProgressRef.current) return;
      const { currentSuspectId, partnerCharges, aggravationLevels, selectedCaseId, evidenceDiscovered, chatHistory, gameTime } = gameState;
      if (!currentSuspectId || !selectedCaseId || partnerCharges <= 0) return;

      actionInProgressRef.current = true;
      const currentCase = findCaseById(selectedCaseId)!;
      const suspect = currentCase.suspects.find(s => s.id === currentSuspectId)!;
      const currentAgg = aggravationLevels[currentSuspectId] || 0;
      
      const newGameTime = gameTime + TIME_INCREMENT_MS;
      
      setThinkingSuspectIds(prev => new Set(prev).add(currentSuspectId));

      let newPartnerEmotion = Emotion.NEUTRAL;
      if (action === 'goodCop') newPartnerEmotion = Emotion.HAPPY;
      else if (action === 'badCop') newPartnerEmotion = Emotion.ANGRY;
      else if (action === 'examine' || action === 'hint') newPartnerEmotion = Emotion.NEUTRAL;

      try {
        const partnerDialogue = await getPartnerIntervention(
           action, 
           suspect,
           currentCase,
           chatHistory[currentSuspectId] || [],
           evidenceDiscovered
        );

        let newAgg = currentAgg;
        let whisperComment = "";
        if (action === 'goodCop') {
            newAgg = Math.floor(currentAgg * (0.5 + Math.random() * 0.2));
            whisperComment = "I smoothed things over. They seem calmer now.";
        } else if (action === 'badCop') {
            let aggIncrease = 8 + Math.floor(Math.random() * 10);
            newAgg = Math.min(100, currentAgg + aggIncrease);
            whisperComment = "Reading their reaction...";
        } else if (action === 'examine') {
            whisperComment = "Examination logged.";
        } else if (action === 'hint') {
            whisperComment = "Hope that helps.";
        }

        // Generate TTS for the PARTNER's dialogue
        let partnerAudioUrl: string | null = null;
        const partnerVoice = currentCase.partner?.voice;
        const partnerVoiceStyle = currentCase.partner?.voiceStyle;
        if (!isMuted && partnerVoice && partnerVoice !== 'None') {
            partnerAudioUrl = await generateTTS(partnerDialogue, partnerVoice, partnerVoiceStyle);
        }

        const partnerMsg: ChatMessage = {
            sender: 'partner',
            text: partnerDialogue,
            timestamp: formatTime(newGameTime),
            type: action === 'badCop' ? 'action' : 'talk',
            audioUrl: partnerAudioUrl
        };

        setCurrentSuggestions([]);

        const historyWithPartner = [...(chatHistory[currentSuspectId] || []), partnerMsg];

        setGameState(prev => ({
          ...prev,
          partnerCharges: prev.partnerCharges - 1,
          chatHistory: { ...prev.chatHistory, [currentSuspectId]: [...(prev.chatHistory[currentSuspectId] || []), partnerMsg] },
          sidekickComment: whisperComment,
          partnerEmotion: newPartnerEmotion,
          gameTime: newGameTime,
          lastInteractionTimes: { ...prev.lastInteractionTimes, [currentSuspectId]: newGameTime },
          suspectSuggestions: { ...prev.suspectSuggestions, [currentSuspectId]: [] }
        }));

        // For deceased suspects: examine/hint should trigger a narrator response
        if (suspect.isDeceased && (action === 'examine' || action === 'hint')) {
            const examPrompt = action === 'examine' 
              ? `[PARTNER EXAMINATION]: "${partnerDialogue}". The partner has done an initial visual examination. Describe what is found and guide the detective to look closer at a specific area.`
              : `[PARTNER HINT]: "${partnerDialogue}". The partner suggests where to look next.`;
            
            const examResponse = await getSuspectResponse(
              suspect, currentCase, examPrompt, 'action', null, 0, false, evidenceDiscovered, newGameTime,
              historyWithPartner
            );
            
            let examAudioUrl: string | null = null;
            if (!isMuted && suspect.voice && suspect.voice !== 'None') {
                examAudioUrl = await generateTTS(examResponse.text, suspect.voice, suspect.voiceStyle);
            }
            
            const narratorMsg: ChatMessage = {
                sender: 'suspect',
                text: examResponse.text,
                timestamp: formatTime(newGameTime),
                evidence: examResponse.revealedEvidence.length > 0 ? examResponse.revealedEvidence : null,
                isEvidenceCollected: examResponse.revealedEvidence.map(() => false),
                audioUrl: examAudioUrl
            };
            
            setGameState(prev => ({
                ...prev,
                chatHistory: { ...prev.chatHistory, [currentSuspectId]: [...(prev.chatHistory[currentSuspectId] || []), narratorMsg] },
                suspectEmotions: {
                  ...prev.suspectEmotions,
                  [currentSuspectId]: resolveVictimExaminationPortraitKey(
                    suspect,
                    examResponse.emotion,
                    examResponse.environmentEvidenceId
                  ),
                }
            }));
            
            setThinkingSuspectIds(prev => { const next = new Set(prev); next.delete(currentSuspectId); return next; });
            return;
        }
        
        // For alive suspects with non-combat partner actions, just return
        if (suspect.isDeceased) {
             setThinkingSuspectIds(prev => { const next = new Set(prev); next.delete(currentSuspectId); return next; });
             return; 
        }

        const promptForSuspect = `[PARTNER INTERVENTION (${action === 'goodCop' ? 'GOOD COP' : 'BAD COP'})]: "${partnerDialogue}"`;

        const response = await getSuspectResponse(
          suspect,
          currentCase,
          promptForSuspect,
          'action', 
          null, 
          newAgg, 
          false,
          evidenceDiscovered,
          newGameTime,
          historyWithPartner
        );

        let finalAgg = newAgg + response.aggravationDelta;
        finalAgg = Math.max(0, Math.min(100, finalAgg));
        // Generate TTS Audio
        let audioUrl: string | null = null;
        if (!isMuted && suspect.voice && suspect.voice !== 'None') {
            audioUrl = await generateTTS(
              finalAgg >= 100 ? "That's it! I want my lawyer!" : response.text,
              suspect.voice,
              suspect.voiceStyle
            );
        }

        const suspectMsg: ChatMessage = {
            sender: 'suspect',
            text: finalAgg >= 100 ? "That's it! I want my lawyer!" : response.text,
            timestamp: formatTime(newGameTime),
            evidence: response.revealedEvidence.length > 0 ? response.revealedEvidence : null,
            isEvidenceCollected: response.revealedEvidence.map(() => false),
            audioUrl: audioUrl
        };

        let finalWhisper = whisperComment;
        if (action === 'badCop') {
            const unrevealed = suspect.hiddenEvidence.filter(hiddenEv => {
                const cleanHiddenTitle = hiddenEv.title.toLowerCase();
                
                const isDiscovered = evidenceDiscovered.some(discoveredEv => 
                    discoveredEv.title.toLowerCase().includes(cleanHiddenTitle)
                );
                
                const isJustRevealed = response.revealedEvidence.length > 0
                    ? response.revealedEvidence.some(re => re.toLowerCase().includes(cleanHiddenTitle))
                    : false;

                return !isDiscovered && !isJustRevealed;
            });
            finalWhisper = await getBadCopHint(suspect, unrevealed, response.text);
        }

        setGameState(prev => {
            const prevHistory = prev.chatHistory[currentSuspectId] || [];
            const newHistory = [...prevHistory, suspectMsg];

            const newTimelineStatements = processTimelineEntries(
              response, suspect, currentSuspectId, finalAgg,
              prev.timelineStatementsDiscovered, 'PARTNER'
            );

            return {
                ...prev,
                aggravationLevels: { ...prev.aggravationLevels, [currentSuspectId]: finalAgg },
                sidekickComment: finalWhisper,
                suspectEmotions: {
                  ...prev.suspectEmotions,
                  [currentSuspectId]: resolveVictimExaminationPortraitKey(
                    suspect,
                    response.emotion,
                    response.environmentEvidenceId
                  ),
                },
                chatHistory: { ...prev.chatHistory, [currentSuspectId]: newHistory },
                timelineStatementsDiscovered: newTimelineStatements
            };
        });

        setUnreadSuspects(prev => { const next = new Map(prev); next.set(currentSuspectId, (next.get(currentSuspectId) || 0) + 1); return next; });

    } catch (e: any) {
        console.error("Partner Action Error:", e);
        toast.error(`Partner action failed: ${e?.message || 'Connection interrupted. Please try again.'}`);
        setGameState(prev => ({
          ...prev,
          sidekickComment: "I... lost my train of thought. Let's try that again.",
          chatHistory: {
            ...prev.chatHistory,
            [currentSuspectId]: [
               ...(prev.chatHistory[currentSuspectId] || []),
               { sender: 'system', text: "[ERROR] Connection Interrupted. Please retry.", timestamp: formatTime(newGameTime) }
            ]
          }
        }));
      } finally {
        actionInProgressRef.current = false;
        setThinkingSuspectIds(prev => { const next = new Set(prev); next.delete(currentSuspectId); return next; });
      }
  };

  const handleSendMessage = async (text: string, type: 'talk' | 'action' = 'talk', attachment?: string) => {
    console.log('[DEBUG] handleSendMessage:', { text, type, attachment });
    if (actionInProgressRef.current) return;
    const { selectedCaseId, currentSuspectId, chatHistory, aggravationLevels, evidenceDiscovered, gameTime } = gameState;
    if (!selectedCaseId || !currentSuspectId) return;

    actionInProgressRef.current = true;
    const currentCase = findCaseById(selectedCaseId);
    if (!currentCase) return;

    const currentSuspect = currentCase.suspects.find(s => s.id === currentSuspectId)!;
    const currentAgg = aggravationLevels[currentSuspectId];

    if (currentAgg >= 100) return;

    const newGameTime = gameTime + TIME_INCREMENT_MS;

    const suspectHistory = chatHistory[currentSuspectId] || [];
    const isFirstTurn = !suspectHistory.some(m => m.sender === 'player');

    let finalText = text;
    if (type === 'action') {
      const words = text.trim().split(' ');
      let verb = words[0].toLowerCase();
      if (verb === 'i' && words.length > 1) {
         verb = words[1].toLowerCase();
         words.shift(); 
      }
      if (verb === 'be') verb = 'is';
      else if (verb === 'have') verb = 'has';
      else if (verb.match(/(ss|x|ch|sh|o)$/)) verb += 'es';
      else if (verb.endsWith('y') && !verb.match(/[aeiou]y$/)) verb = verb.slice(0, -1) + 'ies';
      else if (!verb.endsWith('s')) verb += 's';
      words[0] = verb;
      finalText = `* ${words.join(' ')} *`;
    }

    const userMsg: ChatMessage = { 
      sender: 'player', 
      text: finalText, 
      type: type,
      attachment: attachment || null,
      timestamp: formatTime(newGameTime) 
    };

    const historyForModel = [...suspectHistory, userMsg];

    setGameState(prev => ({
      ...prev,
      gameTime: newGameTime,
      lastInteractionTimes: { ...prev.lastInteractionTimes, [currentSuspectId]: newGameTime },
      chatHistory: { ...prev.chatHistory, [currentSuspectId]: [...(chatHistory[currentSuspectId] || []), userMsg] },
    }));
    
    setThinkingSuspectIds(prev => new Set(prev).add(currentSuspectId));

    try {
      const response = await getSuspectResponse(
        currentSuspect, 
        currentCase, 
        userMsg.text, 
        type,
        attachment || null,
        currentAgg,
        isFirstTurn,
        evidenceDiscovered,
        newGameTime,
        historyForModel
      );

      let newAgg = (aggravationLevels[currentSuspectId] || 0) + response.aggravationDelta;
      newAgg = Math.max(0, Math.min(100, newAgg));

      const finalMsgText = newAgg >= 100 
        ? "That's it! I'm done talking. I want my lawyer. Now!"
        : response.text;

      // Generate TTS Audio
      let audioUrl: string | null = null;
      if (!isMuted && currentSuspect.voice && currentSuspect.voice !== 'None') {
          audioUrl = await generateTTS(finalMsgText, currentSuspect.voice, currentSuspect.voiceStyle);
      }
      
      const suspectMsg: ChatMessage = { 
          sender: 'suspect', 
          text: finalMsgText, 
          timestamp: formatTime(newGameTime),
          evidence: newAgg >= 100 || response.revealedEvidence.length === 0 ? null : response.revealedEvidence, 
          isEvidenceCollected: response.revealedEvidence.map(() => false),
          audioUrl: audioUrl
      };

      setGameState(prev => {
        const updatedHistory = [...prev.chatHistory[currentSuspectId], suspectMsg];
        
        const newTimelineStatements = processTimelineEntries(
          response, currentSuspect, currentSuspectId, newAgg,
          prev.timelineStatementsDiscovered, 'MESSAGE'
        );

        return {
          ...prev,
          chatHistory: { ...prev.chatHistory, [currentSuspectId]: updatedHistory },
          aggravationLevels: { ...prev.aggravationLevels, [currentSuspectId]: newAgg },
          suspectEmotions: {
            ...prev.suspectEmotions,
            [currentSuspectId]: resolveVictimExaminationPortraitKey(
              currentSuspect,
              response.emotion,
              response.environmentEvidenceId
            ),
          },
          timelineStatementsDiscovered: newTimelineStatements,
          suspectSuggestions: { ...prev.suspectSuggestions, [currentSuspectId]: response.hints }
        };
      });

      setUnreadSuspects(prev => { const next = new Map(prev); next.set(currentSuspectId, (next.get(currentSuspectId) || 0) + 1); return next; });

      setCurrentSuggestions(response.hints);
    } catch (e: any) {
      console.error("AI Generation Error:", e);
      toast.error(`Response failed: ${e?.message || 'Connection interrupted. Please try again.'}`);
      setGameState(prev => ({
        ...prev,
        chatHistory: {
           ...prev.chatHistory,
           [currentSuspectId]: [
             ...(prev.chatHistory[currentSuspectId] || []),
             { sender: 'system', text: "[ERROR] Uplink Interrupted. Please retransmit.", timestamp: formatTime(newGameTime) }
           ]
        }
      }));
    } finally {
      actionInProgressRef.current = false;
      setThinkingSuspectIds(prev => { const next = new Set(prev); next.delete(currentSuspectId); return next; });
    }
  };

  const handleSendOfficerMessage = async (text: string) => {
    if (actionInProgressRef.current) return;
    if (gameState.officerHintsRemaining <= 0 || !gameState.selectedCaseId) return;
    
    actionInProgressRef.current = true;
    const newGameTime = gameState.gameTime + TIME_INCREMENT_MS;

    const userMsg: ChatMessage = { sender: 'player', text, timestamp: formatTime(newGameTime) };
    setGameState(prev => ({
      ...prev,
      gameTime: newGameTime,
      officerHistory: [...prev.officerHistory, userMsg],
      officerHintsRemaining: prev.officerHintsRemaining - 1
    }));

    setThinkingSuspectIds(prev => new Set(prev).add('__officer__'));
    
    try {
      const currentCase = findCaseById(gameState.selectedCaseId)!;
      
      const responseText = await getOfficerChatResponse(
        currentCase, 
        text, 
        gameState.evidenceDiscovered, 
        gameState.notes,
        gameState.chatHistory 
      );
      
      const officerMsg: ChatMessage = { sender: 'officer', text: responseText, timestamp: formatTime(newGameTime) };
      
      setGameState(prev => ({
        ...prev,
        officerHistory: [...prev.officerHistory, officerMsg]
      }));
    } catch (e: any) {
      console.error("Officer Chat Error:", e);
      toast.error(`Officer response failed: ${e?.message || 'Secure line disconnected. Try again.'}`);
      setGameState(prev => ({
        ...prev,
        officerHistory: [...prev.officerHistory, { sender: 'system', text: "[SECURE LINE DISCONNECTED]", timestamp: formatTime(newGameTime) }]
      }));
    } finally {
      actionInProgressRef.current = false;
      setThinkingSuspectIds(prev => { const next = new Set(prev); next.delete('__officer__'); return next; });
    }
  };

  const collectEvidence = (msgIndex: number, rawEvidenceString: string, suspectId: string, evidenceIndex: number = 0) => {
    setGameState(prev => {
      const history = [...(prev.chatHistory[suspectId] || [])];
      if (history[msgIndex]) {
        const collected = [...(history[msgIndex].isEvidenceCollected || [])];
        collected[evidenceIndex] = true;
        history[msgIndex] = { ...history[msgIndex], isEvidenceCollected: collected };
      }
      
      const currentCase = findCaseById(prev.selectedCaseId);
      if (!currentCase) return prev;

      const { title: parsedTitle, descriptionHint } = parseRevealedEvidenceForCollection(rawEvidenceString);
      let parsedDesc =
        descriptionHint ||
        `Evidence discovered from ${currentCase.suspects.find(s => s.id === suspectId)?.name || 'Unknown'}.`;

      // Find actual Evidence object in known lists
      let foundEvidence: Evidence | undefined;
      let evidenceResolutionSource: 'hidden' | 'initial' | 'synthetic' = 'synthetic';
      
      // Check Hidden Evidence for Suspects
      const suspect = currentCase.suspects.find(s => s.id === suspectId);
      if (suspect) {
          foundEvidence = suspect.hiddenEvidence.find(e => 
              e.title.toLowerCase() === parsedTitle.toLowerCase() || 
              parsedTitle.toLowerCase().includes(e.title.toLowerCase())
          );
          if (foundEvidence) evidenceResolutionSource = 'hidden';
      }
      
      // Fallback: Check Initial Evidence
      if (!foundEvidence) {
          foundEvidence = currentCase.initialEvidence.find(e => 
            e.title.toLowerCase() === parsedTitle.toLowerCase()
          );
          if (foundEvidence) evidenceResolutionSource = 'initial';
      }

      // If not found (AI hallucinated new item), create entry with parsed title/desc
      if (!foundEvidence) {
          foundEvidence = {
              id: `discovered-${Date.now()}`,
              title: parsedTitle,
              description: parsedDesc,
              imageUrl: undefined
          };
      }

      // #region agent log
      fetch('http://127.0.0.1:7823/ingest/7ccd5c3b-2f27-4653-a2d1-5c9a73591090',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0a2296'},body:JSON.stringify({sessionId:'0a2296',runId:'pre',hypothesisId:'H2',location:'useGameActions.ts:collectEvidence',message:'resolved evidence source',data:{suspectId,parsedTitle,resolvedSource:evidenceResolutionSource,resolvedTitle:foundEvidence?.title},timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      const alreadyHas = prev.evidenceDiscovered.some(e => e.title === foundEvidence!.title);
      if (!alreadyHas) {
        setNewEvidenceTitles(prevTitles => new Set(prevTitles).add(foundEvidence!.title));
      }
      
      return {
        ...prev,
        chatHistory: { ...prev.chatHistory, [suspectId]: history },
        evidenceDiscovered: alreadyHas ? prev.evidenceDiscovered : [...prev.evidenceDiscovered, foundEvidence!]
      };
    });
  };

  const handleForceEvidence = (suspectId: string, evidenceTitle: string) => {
    const msg: ChatMessage = {
      sender: 'suspect',
      text: "[DEBUG FORCE] Okay, fine! I'll tell you about this.",
      timestamp: formatTime(gameState.gameTime),
      evidence: [evidenceTitle],
      isEvidenceCollected: [false]
    };
    
    setGameState(prev => ({
      ...prev,
      chatHistory: {
        ...prev.chatHistory,
        [suspectId]: [...(prev.chatHistory[suspectId] || []), msg]
      }
    }));
  };

  return {
    selectCase,
    startInterrogation,
    handlePartnerAction,
    handleSendMessage,
    handleSendOfficerMessage,
    collectEvidence,
    handleForceEvidence,
  };
};
