
import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { GameState, ScreenState, ChatMessage, Emotion, CaseData, Evidence } from './types';
import { getSuspectResponse, getOfficerChatResponse, generateCaseFromPrompt, getBadCopHint, getPartnerIntervention, pregenerateCaseImages, calculateDifficulty } from './services/geminiService';
import { generateTTS } from './services/geminiTTS';
import { fetchCommunityCases, fetchUserCases, publishCase, deleteCase, updateCase, fetchAllCaseStats, fetchCaseStats, fetchUserVote, submitVote, recordGameResult, saveLocalDraft, fetchLocalDrafts, deleteLocalDraft } from './services/persistence';
import { CaseStats } from './types';
import { auth, logout } from './services/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Overlay, ModalBox, ModalTitle, ModalText, ModalButtonRow, Button } from './components/ui';

// Extracted utilities
import { formatTime, formatAuthorName, TIME_INCREMENT_MS, WAIT_THRESHOLD_MS, INITIAL_TIME_MS, DEFAULT_SUGGESTIONS } from './utils/timeUtils';
import { normalizeTimeString, matchNormalizedTimeToTimeline, textHasAnyTimeReference, extractTimelineFromText } from './utils/timelineExtraction';
import { parseRevealedEvidenceForCollection } from './utils/evidenceRevealParsing';
import { resolveVictimExaminationPortraitKey } from './utils/victimPortraitKeys';

// Import Modular Components
import Layout from './components/Layout';
import CaseSelection from './screens/CaseSelection';
import CaseHub from './screens/CaseHub';
import Interrogation from './screens/Interrogation';
import Accusation from './screens/Accusation';
import EndGame from './screens/EndGame';
import CreateCase from './screens/CreateCase';
import CaseReview from './screens/CaseReview';
import BootSequence from './components/BootSequence';
import Login from './components/Login';

// --- MODAL BUTTON VARIANTS ---
const ConfirmButton = styled(Button).attrs({ $variant: 'danger' as const })`
  flex: 1;
`;
const CancelButton = styled(Button).attrs({ $variant: 'ghost' as const })`
  flex: 1;
  background: var(--color-border-subtle);
  border: 1px solid var(--color-border-strong);
  &:hover { background: var(--color-border-strong); }
`;

const App: React.FC = () => {
  // --- AUTH ---
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const isAdmin = user?.email === 'noahsemus@gmail.com';

  // --- STATE ---
  const [hasBooted, setHasBooted] = useState(false);
  const [powerState, setPowerState] = useState<'on' | 'off' | 'turning-on' | 'turning-off'>('turning-on');
  
  const [communityCases, setCommunityCases] = useState<CaseData[]>([]);
  const [loadingCommunity, setLoadingCommunity] = useState(false);
  
  // Social features state
  const [localDrafts, setLocalDrafts] = useState<CaseData[]>([]);
  const [allCaseStats, setAllCaseStats] = useState<Record<string, CaseStats>>({});
  const [currentCaseStats, setCurrentCaseStats] = useState<CaseStats | null>(null);
  const [currentUserVote, setCurrentUserVote] = useState<'up' | 'down' | null>(null);
  const [hasRecordedResult, setHasRecordedResult] = useState(false);

  const [gameState, setGameState] = useState<GameState>({
    currentScreen: ScreenState.CASE_SELECTION,
    selectedCaseId: null,
    currentSuspectId: null,
    aggravationLevels: {},
    notes: {},
    evidenceDiscovered: [],
    timelineStatementsDiscovered: [],
    chatHistory: {},
    officerHistory: [],
    suspectEmotions: {},
    partnerEmotion: Emotion.NEUTRAL,
    suspectTurnIds: {},
    gameResult: null,
    accusedSuspectIds: [],
    officerHintsRemaining: 10,
    currentOfficerHint: null,
    sidekickComment: null,
    partnerCharges: 3,
    gameTime: INITIAL_TIME_MS,
    lastInteractionTimes: {},
    suspectSuggestions: {}
  });

  const [draftCase, setDraftCase] = useState<CaseData | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string>("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [pendingPublishDraftId, setPendingPublishDraftId] = useState<string | null>(null);
  const [thinkingSuspectIds, setThinkingSuspectIds] = useState<Set<string>>(new Set());
  const [hasUnsavedDraftChanges, setHasUnsavedDraftChanges] = useState(false);
  const draftSaveFnRef = useRef<(() => Promise<void>) | null>(null);
  const draftCheckConsistencyFnRef = useRef<(() => void) | null>(null);
  const draftCloseFnRef = useRef<(() => void) | null>(null);
  const originalDraftRef = useRef<CaseData | null>(null);
  
  const [currentSuggestions, setCurrentSuggestions] = useState<(string | { label: string; text: string })[]>([]);
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem('isMuted') === 'true');
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('globalVolume');
    return saved !== null ? parseFloat(saved) : 0.7;
  });
  const [mobileIntelOpen, setMobileIntelOpen] = useState(false);
  const [unreadSuspects, setUnreadSuspects] = useState<Map<string, number>>(new Map());
  const [newEvidenceTitles, setNewEvidenceTitles] = useState<Set<string>>(new Set());
  const [newTimelineIds, setNewTimelineIds] = useState<Set<string>>(new Set());
  const [caseSelectionTab, setCaseSelectionTab] = useState<'featured' | 'network' | 'mycases'>('featured');
  const [boardAccordionTab, setBoardAccordionTab] = useState<string>('evidence');

  useEffect(() => {
    localStorage.setItem('isMuted', String(isMuted));
  }, [isMuted]);

  useEffect(() => {
    localStorage.setItem('globalVolume', String(volume));
  }, [volume]);

  // Sync draftCase changes back to communityCases and localDrafts for UI consistency
  useEffect(() => {
    if (draftCase) {
      setCommunityCases(prev => prev.map(c => c.id === draftCase.id ? draftCase : c));
      setLocalDrafts(prev => prev.map(d => d.id === draftCase.id ? draftCase : d));
    }
  }, [draftCase]);

  // DEBUG: Log State Transitions
  useEffect(() => {
    console.log("[DEBUG] Game State Update:", { 
      screen: gameState.currentScreen,
      case: gameState.selectedCaseId,
      suspect: gameState.currentSuspectId,
      aggravation: gameState.aggravationLevels,
      time: formatTime(gameState.gameTime)
    });
  }, [gameState.currentScreen, gameState.selectedCaseId, gameState.currentSuspectId, gameState.aggravationLevels, gameState.gameTime]);

  // Handle Boot Sequence Completion
  const handleBootComplete = () => {
    // 1. Start turning off (collapse screen)
    setPowerState('turning-off');
    
    // 2. Wait for collapse (500ms), then switch to game mode and turn on again
    setTimeout(() => {
       setHasBooted(true);
       setPowerState('turning-on');
    }, 600);
  };



  // Handle Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch Community Cases and Stats on Mount
  useEffect(() => {
    if (user) {
      loadCommunity();
      loadDrafts();
    }
  }, [user]);

  const loadCommunity = async () => {
    setLoadingCommunity(true);
    // Fetch published community cases AND the current user's own cases (published+unpublished)
    const fetches: [Promise<CaseData[]>, Promise<CaseData[]>, Promise<Record<string, CaseStats>>] = [
      fetchCommunityCases(),
      user?.uid ? fetchUserCases(user.uid) : Promise.resolve([]),
      fetchAllCaseStats()
    ];
    const [publishedCases, userCases, stats] = await Promise.all(fetches);
    
    // Merge: user's own cases take precedence (they may have unpublished edits)
    const caseMap = new Map<string, CaseData>();
    publishedCases.forEach(c => caseMap.set(c.id, c));
    userCases.forEach(c => caseMap.set(c.id, c)); // User's version overwrites community version
    
    // Filter out corrupted cases (missing ID or title or empty strings)
    const validCases = Array.from(caseMap.values()).filter(c => 
      c && 
      c.id && typeof c.id === 'string' && c.id.trim() !== '' &&
      c.title && typeof c.title === 'string' && c.title.trim() !== ''
    );
    setCommunityCases(validCases);
    setAllCaseStats(stats);
    setLoadingCommunity(false);
  };

  const loadDrafts = () => {
    setLocalDrafts(fetchLocalDrafts());
  };



  // --- HELPERS ---

  // Resolves a case by ID from all sources (community, draft, local)
  const findCaseById = (caseId: string | null | undefined): CaseData | undefined => {
    if (!caseId) return undefined;
    return communityCases.find(c => c.id === caseId)
      || (draftCase?.id === caseId ? draftCase : undefined)
      || localDrafts.find(d => d.id === caseId);
  };

  // --- ACTIONS ---

  const selectCase = (caseInput: string | CaseData) => {
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
    // Don't pre-fill time. Timer starts on first interaction.
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
      suspectSuggestions: {} // Reset suggestions for new case
    }));

    // Pre-load default suggestions but don't persist them yet (since no suspect is selected)
    setCurrentSuggestions(DEFAULT_SUGGESTIONS);
  };

  const startInterrogation = (suspectId: string) => {
    // Check for "Kept Waiting" Penalty logic
    const { gameTime, lastInteractionTimes, aggravationLevels, chatHistory, selectedCaseId, suspectSuggestions } = gameState;
    const currentCase = findCaseById(selectedCaseId)!;
    const suspect = currentCase.suspects.find(s => s.id === suspectId)!;
    
    let newAgg = aggravationLevels[suspectId] || 0;
    let newHistory = chatHistory[suspectId] || [];
    let updatedInteractionTimes = { ...lastInteractionTimes };

    if (!suspect.isDeceased) {
        const lastSeen = lastInteractionTimes[suspectId];
        
        // ONLY check penalty if we have spoken before (timer is running)
        if (lastSeen !== undefined) {
            const diffMs = gameTime - lastSeen;
            
            if (diffMs > WAIT_THRESHOLD_MS) {
                const hours = Math.floor(diffMs / (60 * 60 * 1000));
                const mins = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
                const penalty = 5 + Math.floor(diffMs / (60 * 60 * 1000)) * 5; // +5, then +5 more per hour
                
                newAgg = Math.min(100, newAgg + penalty);
                
                const timeStr = hours > 0 ? `${hours} hour${hours > 1 ? 's' : ''}` : `${mins} mins`;
                
                newHistory = [...newHistory, {
                    sender: 'system',
                    text: `[SYSTEM] Subject is annoyed. You kept them waiting for ${timeStr}. (+${penalty}% Aggravation)`,
                    timestamp: formatTime(gameTime)
                }];
            }
            // Update interaction time to NOW since we are back with them
            updatedInteractionTimes[suspectId] = gameTime;
        }
    }

    // LOAD PERSISTED SUGGESTIONS OR DEFAULTS
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

  const handlePartnerAction = async (action: 'goodCop' | 'badCop' | 'examine' | 'hint') => {
      console.log('[DEBUG] handlePartnerAction:', action);
      const { currentSuspectId, partnerCharges, aggravationLevels, selectedCaseId, evidenceDiscovered, chatHistory, gameTime } = gameState;
      if (!currentSuspectId || !selectedCaseId || partnerCharges <= 0) return;

      const currentCase = findCaseById(selectedCaseId)!;
      const suspect = currentCase.suspects.find(s => s.id === currentSuspectId)!;
      const currentAgg = aggravationLevels[currentSuspectId] || 0;
      
      // ADVANCE TIME
      const newGameTime = gameTime + TIME_INCREMENT_MS;
      
      setThinkingSuspectIds(prev => new Set(prev).add(currentSuspectId));

      // Reaction Logic
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
            newAgg = Math.floor(currentAgg * (0.5 + Math.random() * 0.2)); // Reduce by 30-50%
            whisperComment = "I smoothed things over. They seem calmer now.";
        } else if (action === 'badCop') {
            let aggIncrease = 8 + Math.floor(Math.random() * 10); // +8 to +18 base (AI response adds more)
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

        // Partner clears suggestions for now, as context changes
        setCurrentSuggestions([]);

        const historyWithPartner = [...(chatHistory[currentSuspectId] || []), partnerMsg];

        setGameState(prev => ({
          ...prev,
          partnerCharges: prev.partnerCharges - 1,
          chatHistory: { ...prev.chatHistory, [currentSuspectId]: [...(prev.chatHistory[currentSuspectId] || []), partnerMsg] },
          sidekickComment: whisperComment,
          partnerEmotion: newPartnerEmotion,
          gameTime: newGameTime,
          // Partner action counts as interaction, starting/resetting timer
          lastInteractionTimes: { ...prev.lastInteractionTimes, [currentSuspectId]: newGameTime },
          suspectSuggestions: { ...prev.suspectSuggestions, [currentSuspectId]: [] } // Clear persisted
        }));
        

        // For deceased suspects: examine/hint should still trigger a narrator response
        // describing the body examination result (guiding player toward evidence)
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
          evidenceDiscovered, // Pass discovered evidence
          newGameTime, // Pass current game time
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

            // Timeline extraction for partner action responses — supports MULTIPLE entries
            let newTimelineStatements = [...prev.timelineStatementsDiscovered];
            // Trust AI-provided timeline entries; normalize spelled-out times
            let timelineEntries = response.revealedTimelineStatements
              .filter(e => e && e.time)
              .map(e => ({ ...e, time: normalizeTimeString(e.time) }));
            timelineEntries = timelineEntries.map(e => {
              const canonicalTime = matchNormalizedTimeToTimeline(e.time, suspect.timeline || []);
              return canonicalTime ? { ...e, time: canonicalTime } : e;
            });
            if (timelineEntries.length > 0 && !textHasAnyTimeReference(response.text)) {
              console.log("[DEBUG] Rejecting AI timeline (partner) — no time reference in text", timelineEntries);
              timelineEntries = [];
            }
            if (timelineEntries.length === 0 && finalAgg < 100) {
              timelineEntries = extractTimelineFromText(response.text, suspect.timeline || []);
              if (timelineEntries.length > 0) {
                console.log("[DEBUG] Timeline Statements (PARTNER FALLBACK):", timelineEntries);
              }
            }
            if (finalAgg < 100) {
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

        // Mark suspect as having unread message (badge appears when user switches away)
        setUnreadSuspects(prev => { const next = new Map(prev); next.set(currentSuspectId, (next.get(currentSuspectId) || 0) + 1); return next; });
        // TTS playback is handled by Interrogation.tsx

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
        setThinkingSuspectIds(prev => { const next = new Set(prev); next.delete(currentSuspectId); return next; });
      }
  };

  const handleSendMessage = async (text: string, type: 'talk' | 'action' = 'talk', attachment?: string) => {
    console.log('[DEBUG] handleSendMessage:', { text, type, attachment });
    const { selectedCaseId, currentSuspectId, chatHistory, aggravationLevels, evidenceDiscovered, gameTime } = gameState;
    if (!selectedCaseId || !currentSuspectId) return;

    const currentCase = findCaseById(selectedCaseId);
    if (!currentCase) return;

    const currentSuspect = currentCase.suspects.find(s => s.id === currentSuspectId)!;
    const currentAgg = aggravationLevels[currentSuspectId];

    if (currentAgg >= 100) return;

    // ADVANCE TIME
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
      // Message interaction starts/resets the timer
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
        evidenceDiscovered, // Pass discovered evidence
        newGameTime, // Pass current game time
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
        let newTimelineStatements = [...prev.timelineStatementsDiscovered];

        // Use AI's explicit timeline statements, or fall back to client-side extraction
        // Supports MULTIPLE timeline entries per response
        // Trust AI-provided timeline entries if they have valid time fields;
        // normalize any spelled-out times to numerical format.
        let timelineEntries = response.revealedTimelineStatements
          .filter(e => e && e.time)
          .map(e => ({ ...e, time: normalizeTimeString(e.time) }));
        // If the AI returned entries but the times don't match any known timeline,
        // try to match the normalized time against the suspect's actual timeline entries
        // so we use the canonical time string (e.g. "8:00 PM" not just "8:00").
        timelineEntries = timelineEntries.map(e => {
          const canonicalTime = matchNormalizedTimeToTimeline(e.time, currentSuspect.timeline || []);
          return canonicalTime ? { ...e, time: canonicalTime } : e;
        });
        // Only reject if both the AI produced entries AND the text has zero time references
        // (numerical or word-based) — a sign the AI hallucinated timeline data
        if (timelineEntries.length > 0 && !textHasAnyTimeReference(response.text)) {
          console.log("[DEBUG] Rejecting AI timeline entries — no time reference in text at all", timelineEntries);
          timelineEntries = [];
        }
        if (timelineEntries.length === 0 && newAgg < 100) {
          timelineEntries = extractTimelineFromText(response.text, currentSuspect.timeline || []);
          if (timelineEntries.length > 0) {
            console.log("[DEBUG] Timeline Statements (FALLBACK extraction):", timelineEntries);
          }
        }

        if (newAgg < 100) {
          for (let i = 0; i < timelineEntries.length; i++) {
            const entry = timelineEntries[i];
            console.log("[DEBUG] Timeline Statement Revealed:", entry);
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
                suspectName: currentSuspect.name,
                suspectPortrait: currentSuspect.portraits?.[Emotion.NEUTRAL] || undefined,
                time: entry.time,
                statement: entry.statement,
                day: entry.day || 'Today',
                dayOffset: entry.dayOffset ?? 0
              });
              setNewTimelineIds(prev => new Set(prev).add(tsId));
            }
          }
        }

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
          // PERSIST SUGGESTIONS PER SUSPECT
          suspectSuggestions: { ...prev.suspectSuggestions, [currentSuspectId]: response.hints }
        };
      });

      // Mark suspect as having unread message (badge appears when user switches away)
      setUnreadSuspects(prev => { const next = new Map(prev); next.set(currentSuspectId, (next.get(currentSuspectId) || 0) + 1); return next; });
      // TTS playback is handled by Interrogation.tsx

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
      setThinkingSuspectIds(prev => { const next = new Set(prev); next.delete(currentSuspectId); return next; });
    }
  };

  const handleSendOfficerMessage = async (text: string) => {
    if (gameState.officerHintsRemaining <= 0 || !gameState.selectedCaseId) return;
    
    // Officer chat also advances time, though maybe less? Let's stick to consistent 5 mins for simplicity
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
      setThinkingSuspectIds(prev => { const next = new Set(prev); next.delete('__officer__'); return next; });
    }
  };

  const handleGenerateCase = async (prompt: string, isLucky: boolean) => {
    // CRITICAL: User must be logged in to create a case (enforced by login gate)
    if (!user?.uid) {
        console.error('[CRITICAL] handleGenerateCase: No user logged in!');
        toast.error('You must be logged in to create a case.');
        return;
    }
    
    setIsGenerating(true);
    setGenerationStatus("Step 1/6: Building case concept from your prompt...");
    try {
        const newCase = await generateCaseFromPrompt(prompt, isLucky, (msg) => {
          setGenerationStatus(msg);
        });
        // CRITICAL: Always stamp creator identity — never optional
        newCase.authorId = user.uid;
        newCase.authorDisplayName = formatAuthorName(user.displayName);
        newCase.createdAt = Date.now();
        setGenerationStatus("");
        
        // Save immediately — images will be generated in the background on the edit screen
        saveLocalDraft(newCase);
        setLocalDrafts(fetchLocalDrafts());
        
        // Open edit screen first
        setDraftCase(newCase);
        originalDraftRef.current = JSON.parse(JSON.stringify(newCase));
        setGameState(prev => ({ ...prev, currentScreen: ScreenState.CASE_REVIEW }));
    } catch (e: any) {
        console.error("Generation Error:", e);
        toast.error(`Case generation failed: ${e.message || 'Unknown error'}`);
    } finally {
        setIsGenerating(false);
        setGenerationStatus("");
    }
  };

  const handleSaveAndStart = async () => {
    if (!draftCase) return;
    
    // CRITICAL: Enforce author identity on every save
    if (!user?.uid) {
        console.error('[CRITICAL] handleSaveAndStart: No user logged in!');
        toast.error('You must be logged in to save a case.');
        return;
    }
    
    // Always stamp author info from the CURRENT user — never trust what's on the draft alone
    const stamped: CaseData = {
      ...draftCase,
      authorId: user.uid,
      authorDisplayName: draftCase.authorDisplayName && draftCase.authorDisplayName !== 'Anonymous' && draftCase.authorDisplayName !== 'Unknown Author'
        ? draftCase.authorDisplayName
        : formatAuthorName(user.displayName),
      createdAt: draftCase.createdAt || Date.now()
    };

    if (stamped.isUploaded) {
        // Persist the edit to the server (case is already published)
        const success = await updateCase(stamped.id, stamped);
        if (!success) {
            toast.error('Failed to save changes to the server.');
            return;
        }
        // Fetch updated case to get the new version number
        await loadCommunity();
        // Also update local draft so My Cases sort refreshes
        saveLocalDraft(stamped);
        setLocalDrafts(fetchLocalDrafts());
        const updatedCase = communityCases.find(c => c.id === stamped.id) || stamped;
        selectCase(updatedCase);
    } else {
        // Save to Firebase (private, not published) AND locally (stamps updatedAt)
        saveLocalDraft(stamped);
        const refreshed = fetchLocalDrafts();
        setLocalDrafts(refreshed);
        const savedVersion = refreshed.find(d => d.id === stamped.id) || stamped;
        // Also persist to Firebase so it's not lost if localStorage clears
        await updateCase(stamped.id, stamped);
        setCommunityCases(prev => {
            if (!stamped.id || !stamped.title) return prev;
            const exists = prev.some(c => c.id === stamped.id);
            if (exists) return prev.map(c => c.id === stamped.id ? savedVersion : c);
            return [savedVersion, ...prev];
        });
        selectCase(savedVersion);
    }
    setDraftCase(null);
    originalDraftRef.current = null;
  };

  // Test Investigation: starts the case without saving
  const handleTestInvestigation = () => {
    if (draftCase) {
      selectCase(draftCase);
      // Don't clear draftCase — user can return to editing
    }
  };

  // App-level save for when CaseReview is unmounted (e.g., during gameplay testing)
  const handleSaveDraftFromHeader = async () => {
    if (!draftCase) return;
    
    // CRITICAL: Always stamp authorId before any save
    if (!user?.uid) {
      console.error('[CRITICAL] handleSaveDraftFromHeader: No user logged in!');
      toast.error('You must be logged in to save.');
      return;
    }
    
    const stamped: CaseData = {
      ...draftCase,
      authorId: user.uid,
      authorDisplayName: draftCase.authorDisplayName && draftCase.authorDisplayName !== 'Anonymous' && draftCase.authorDisplayName !== 'Unknown Author'
        ? draftCase.authorDisplayName
        : formatAuthorName(user.displayName),
    };
    
    const { updateCase: doUpdate, saveLocalDraft: doSaveLocal } = await import('./services/persistence');
    // Always save locally as a safety net (this stamps updatedAt)
    doSaveLocal(stamped);
    const refreshedDrafts = fetchLocalDrafts();
    setLocalDrafts(refreshedDrafts);
    // Use the localStorage version (includes updatedAt) for state consistency
    const savedVersion = refreshedDrafts.find(d => d.id === stamped.id) || stamped;
    // Also persist to Firebase
    const success = await doUpdate(stamped.id, stamped);
    setDraftCase(savedVersion);
    originalDraftRef.current = JSON.parse(JSON.stringify(savedVersion));
    setHasUnsavedDraftChanges(false);
    if (success) {
      toast.success('Case saved successfully!');
    } else {
      toast.error('Firebase save failed — saved locally as fallback.');
    }
  };

  const handleEditCase = (caseId?: string | any) => {
    const idToEdit = (typeof caseId === 'string') ? caseId : gameState.selectedCaseId;

    // If returning to edit a case that's already in draft (e.g. after test play),
    // just switch to the editor — keep edits and originalDraftRef intact.
    if (draftCase && draftCase.id === idToEdit) {
      setGameState(prev => ({ ...prev, currentScreen: ScreenState.CASE_REVIEW }));
      return;
    }

    const caseToEdit = communityCases.find(c => c.id === idToEdit) || localDrafts.find(d => d.id === idToEdit);
    if (!caseToEdit) return;

    originalDraftRef.current = JSON.parse(JSON.stringify(caseToEdit));
    setDraftCase(caseToEdit);
    setGameState(prev => ({ ...prev, currentScreen: ScreenState.CASE_REVIEW }));
  };

  const initiatePublish = () => {
    if (!gameState.selectedCaseId) return;
    setShowPublishConfirm(true);
  };

  const executePublish = async () => {
    setShowPublishConfirm(false); 
    if (!gameState.selectedCaseId || !user?.uid) return;
    const caseToPublish = communityCases.find(c => c.id === gameState.selectedCaseId);
    if (!caseToPublish) return;

    setIsPublishing(true);
    const success = await publishCase(
      { ...caseToPublish, isUploaded: true, authorId: user.uid }, 
      user.uid, 
      formatAuthorName(user.displayName)
    );
    
    if (success) {
      // Remove from local drafts since it's now published
      deleteLocalDraft(caseToPublish.id);
      setLocalDrafts(fetchLocalDrafts());
      // Re-fetch to get the version and authorId
      await loadCommunity();
    }
    setIsPublishing(false);
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
              description: parsedDesc, // Uses parsed description from AI or generic fallback
              imageUrl: undefined
          };
      }

      // #region agent log
      fetch('http://127.0.0.1:7823/ingest/7ccd5c3b-2f27-4653-a2d1-5c9a73591090',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0a2296'},body:JSON.stringify({sessionId:'0a2296',runId:'pre',hypothesisId:'H2',location:'App.tsx:collectEvidence',message:'resolved evidence source',data:{suspectId,parsedTitle,resolvedSource:evidenceResolutionSource,resolvedTitle:foundEvidence?.title},timestamp:Date.now()})}).catch(()=>{});
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

  const makeAccusation = async (suspectIds: string[]) => {
    const currentCase = findCaseById(gameState.selectedCaseId)!;
    
    const guiltySuspectIds = currentCase.suspects.filter(s => s.isGuilty).map(s => s.id);
    const accusedGuiltyIds = suspectIds.filter(id => guiltySuspectIds.includes(id));
    const accusedInnocentIds = suspectIds.filter(id => !guiltySuspectIds.includes(id));

    let result: 'SUCCESS' | 'PARTIAL' | 'FAILURE';
    if (accusedGuiltyIds.length === guiltySuspectIds.length && accusedInnocentIds.length === 0) {
        result = 'SUCCESS';
    } else if (accusedGuiltyIds.length > 0) {
        result = 'PARTIAL';
    } else {
        result = 'FAILURE';
    }

    setHasRecordedResult(false);

    setGameState(prev => ({
      ...prev,
      gameResult: result,
      accusedSuspectIds: suspectIds,
      currentScreen: ScreenState.ENDGAME
    }));

    // Record result & fetch stats for endgame display
    const suspectsSpoken = Object.keys(gameState.chatHistory).filter(
      sid => (gameState.chatHistory[sid] || []).some(m => m.sender === 'player')
    ).length;
    const evidenceFound = gameState.evidenceDiscovered.length;
    const timelineFound = gameState.timelineStatementsDiscovered.length;

    if (currentCase.isUploaded) {
      await recordGameResult(currentCase.id, result, { evidenceFound, suspectsSpoken, timelineFound });
      const [stats, vote] = await Promise.all([
        fetchCaseStats(currentCase.id),
        user ? fetchUserVote(currentCase.id, user.uid) : Promise.resolve(null)
      ]);
      setCurrentCaseStats(stats);
      setCurrentUserVote(vote);
      // Refresh global stats too
      const allStats = await fetchAllCaseStats();
      setAllCaseStats(allStats);
    }
    setHasRecordedResult(true);
  };

  const handleVote = async (vote: 'up' | 'down') => {
    if (!user || !gameState.selectedCaseId) return;
    await submitVote(gameState.selectedCaseId, user.uid, vote);
    setCurrentUserVote(vote);
    const stats = await fetchCaseStats(gameState.selectedCaseId);
    setCurrentCaseStats(stats);
    setAllCaseStats(prev => ({ ...prev, [gameState.selectedCaseId!]: stats }));
  };

  const handlePublishDraft = (caseId: string) => {
    if (!user?.uid) {
      toast.error('You must be logged in to publish.');
      return;
    }
    setPendingPublishDraftId(caseId);
  };

  const executePublishDraft = async () => {
    const caseId = pendingPublishDraftId;
    setPendingPublishDraftId(null);
    if (!caseId || !user?.uid) return;
    // Check both local drafts and community cases
    const draft = localDrafts.find(d => d.id === caseId) || communityCases.find(c => c.id === caseId);
    if (!draft) return;
    setIsPublishing(true);
    const success = await publishCase(
      { ...draft, isUploaded: true, authorId: user.uid },
      user.uid,
      formatAuthorName(user.displayName)
    );
    if (success) {
      deleteLocalDraft(caseId);
      setLocalDrafts(fetchLocalDrafts());
      await loadCommunity();
    }
    setIsPublishing(false);
  };

  const handleUnpublishCase = async (caseId: string) => {
    const caseToUnpublish = communityCases.find(c => c.id === caseId);
    if (!caseToUnpublish) return;
    // Save to local drafts first, then remove from server
    saveLocalDraft({ ...caseToUnpublish, isUploaded: false });
    setLocalDrafts(fetchLocalDrafts());
    const success = await deleteCase(caseId);
    if (success) {
      await loadCommunity();
    }
  };

  const [draftToDelete, setDraftToDelete] = useState<string | null>(null);

  const handleDeleteDraft = (caseId: string) => {
    setDraftToDelete(caseId);
  };

  const confirmDeleteDraft = async () => {
    if (!draftToDelete) return;
    // Delete from Firebase (case may have been saved but not published)
    await deleteCase(draftToDelete);
    // Delete from local drafts
    deleteLocalDraft(draftToDelete);
    setLocalDrafts(fetchLocalDrafts());
    setCommunityCases(prev => prev.filter(c => c.id !== draftToDelete));
    setDraftToDelete(null);
  };

  const handlePlayDraft = (caseData: CaseData) => {
    // Add draft to communityCases temporarily so selectCase can find it
    setCommunityCases(prev => {
      const exists = prev.some(c => c.id === caseData.id);
      return exists ? prev : [caseData, ...prev];
    });
    selectCase(caseData);
  };

  const resetGame = () => {
    setGameState({
      ...gameState, 
      currentScreen: ScreenState.CASE_SELECTION, 
      selectedCaseId: null, 
      gameResult: null 
    });
  };

  const previousScreenRef = useRef<ScreenState>(gameState.currentScreen);

  const navigateTo = (screen: ScreenState) => {
    if (screen === ScreenState.CASE_SELECTION) {
       previousScreenRef.current = gameState.currentScreen;
       resetGame();
       return;
    }
    // When returning to CaseHub from interrogation, force suspects accordion open
    if (screen === ScreenState.CASE_HUB && (gameState.currentScreen === ScreenState.INTERROGATION || gameState.currentScreen === ScreenState.ACCUSATION)) {
      setBoardAccordionTab('suspects');
    }
    previousScreenRef.current = gameState.currentScreen;
    setGameState(prev => ({ ...prev, currentScreen: screen }));
  };

  const [caseToDelete, setCaseToDelete] = useState<string | null>(null);
  const [myCaseToDelete, setMyCaseToDelete] = useState<string | null>(null);

  const handleDeleteCase = async (caseId: string) => {
    if (!isAdmin) return;
    setCaseToDelete(caseId);
  };

  const handleDeleteMyCase = (caseId: string) => {
    setMyCaseToDelete(caseId);
  };

  const confirmDeleteMyCase = async () => {
    if (!myCaseToDelete) return;
    // Delete from Firebase if published
    const isPublished = communityCases.some(c => c.id === myCaseToDelete && c.isUploaded);
    if (isPublished) {
      await deleteCase(myCaseToDelete);
    }
    // Delete from local drafts
    deleteLocalDraft(myCaseToDelete);
    setLocalDrafts(fetchLocalDrafts());
    setCommunityCases(prev => prev.filter(c => c.id !== myCaseToDelete));
    setMyCaseToDelete(null);
  };

  const confirmDeleteCase = async () => {
    if (!caseToDelete || !isAdmin) return;
    const success = await deleteCase(caseToDelete);
    if (success) {
      setCommunityCases(prev => prev.filter(c => c.id !== caseToDelete));
    }
    setCaseToDelete(null);
  };

  const handleToggleFeatured = async (caseId: string, isFeatured: boolean) => {
    if (!isAdmin) return;
    const targetCase = communityCases.find(c => c.id === caseId);
    const authorId = targetCase?.authorId || user?.uid;
    if (!authorId) return;
    const success = await updateCase(caseId, { isFeatured, authorId });
    if (success) {
      setCommunityCases(prev => prev.map(c => c.id === caseId ? { ...c, isFeatured } : c));
    }
  };

  const currentCase = gameState.selectedCaseId 
    ? findCaseById(gameState.selectedCaseId)
    : undefined;
  
  const isGameplay = 
    gameState.currentScreen === ScreenState.CASE_HUB || 
    gameState.currentScreen === ScreenState.INTERROGATION || 
    gameState.currentScreen === ScreenState.ACCUSATION ||
    gameState.currentScreen === ScreenState.ENDGAME;

  const isCustomCase = currentCase?.id.startsWith('custom-');
  const isNetworkCase = communityCases.some(c => c.id === currentCase?.id && c.isUploaded);
  const isCreator = currentCase?.authorId === user?.uid;

  const canPublish = !!(isCustomCase && !currentCase?.isUploaded && isGameplay && gameState.currentScreen !== ScreenState.ENDGAME);
  const canEdit = !!(isCustomCase && (isAdmin || isCreator) && isGameplay && gameState.currentScreen !== ScreenState.ENDGAME);

  if (authLoading) {
    return (
      <Layout screenState={gameState.currentScreen} isMuted={isMuted} onToggleMute={() => setIsMuted(!isMuted)} onNavigate={() => {}} isBooting>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#0f0' }}>
          INITIALIZING SECURE CONNECTION...
        </div>
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout screenState={gameState.currentScreen} isMuted={isMuted} onToggleMute={() => setIsMuted(!isMuted)} onNavigate={() => {}} isBooting>
        <Login />
      </Layout>
    );
  }

  return (
    <>
    <Layout 
      screenState={gameState.currentScreen}
      caseTitle={currentCase?.title}
      onNavigate={navigateTo}
      isMuted={isMuted}
      onToggleMute={() => setIsMuted(!isMuted)}
      volume={volume}
      onVolumeChange={setVolume}
      onPublish={initiatePublish}
      canPublish={canPublish}
      isPublishing={isPublishing}
      onEdit={handleEditCase}
      canEdit={canEdit}
      isBooting={!hasBooted}
      powerState={powerState}
      mobileAction={gameState.currentScreen === ScreenState.INTERROGATION ? {
        label: mobileIntelOpen ? 'CLOSE' : 'PARTNER',
        onClick: () => setMobileIntelOpen(!mobileIntelOpen),
        active: mobileIntelOpen
      } : undefined}
      user={user}
      onLogout={logout}
      hasUnsavedChanges={hasUnsavedDraftChanges}
      onSaveCase={() => {
        if (draftSaveFnRef.current && gameState.currentScreen === ScreenState.CASE_REVIEW) {
          draftSaveFnRef.current();
        } else {
          handleSaveDraftFromHeader();
        }
      }}
      onCloseCase={gameState.currentScreen === ScreenState.CASE_REVIEW ? () => {
        draftCloseFnRef.current?.();
      } : undefined}
      onCheckConsistency={gameState.currentScreen === ScreenState.CASE_REVIEW ? () => {
        draftCheckConsistencyFnRef.current?.();
      } : undefined}
      onTestInvestigation={gameState.currentScreen === ScreenState.CASE_REVIEW ? handleTestInvestigation : undefined}
    >
      {!hasBooted ? (
        <BootSequence onComplete={handleBootComplete} />
      ) : (
        <>
          {gameState.currentScreen === ScreenState.CASE_SELECTION && (
            <CaseSelection 
                key="screen-selection"
                communityCases={communityCases}
                localDrafts={localDrafts}
                caseStats={allCaseStats}
                isLoadingCommunity={loadingCommunity}
                onSelectCase={selectCase} 
                onCreateNew={() => setGameState(prev => ({ ...prev, currentScreen: ScreenState.CREATE_CASE }))}
                isAdmin={isAdmin}
                userId={user?.uid}
                onDeleteCase={handleDeleteCase}
                onToggleFeatured={handleToggleFeatured}
                onEditCase={handleEditCase}
                onPublishDraft={handlePublishDraft}
                onDeleteDraft={handleDeleteDraft}
                onPlayDraft={handlePlayDraft}
                onUnpublish={handleUnpublishCase}
                onDeleteMyCase={handleDeleteMyCase}
                initialTab={caseSelectionTab}
                onTabChange={setCaseSelectionTab}
            />
          )}

          {gameState.currentScreen === ScreenState.CREATE_CASE && (
            <CreateCase 
                key="screen-create"
                onGenerate={handleGenerateCase}
                onCancel={() => setGameState(prev => ({ ...prev, currentScreen: ScreenState.CASE_SELECTION }))}
                isLoading={isGenerating}
                loadingStatus={generationStatus}
            />
          )}

          {gameState.currentScreen === ScreenState.CASE_REVIEW && draftCase && (
            <CaseReview 
                key="screen-review"
                draftCase={draftCase}
                originalBaseline={originalDraftRef.current}
                onUpdateDraft={(updated) => {
                    const withDiff = { ...updated, difficulty: calculateDifficulty(updated) };
                    setDraftCase(withDiff);
                }}
                onStart={handleTestInvestigation}
                onCancel={() => {
                    if (hasUnsavedDraftChanges) {
                      // User is discarding unsaved edits — revert to last saved state
                      const original = originalDraftRef.current;
                      if (original) {
                        setCommunityCases(prev => prev.map(c => c.id === original.id ? original : c));
                        setLocalDrafts(prev => prev.map(d => d.id === original.id ? original : d));
                      }
                    } else {
                      // No unsaved changes — re-read from localStorage to get authoritative state (with updatedAt)
                      setLocalDrafts(fetchLocalDrafts());
                    }
                    originalDraftRef.current = null;
                    setDraftCase(null);
                    setHasUnsavedDraftChanges(false);
                    setGameState(prev => ({ ...prev, currentScreen: ScreenState.CASE_SELECTION }));
                }}
                userId={user?.uid}
                userDisplayName={formatAuthorName(user?.displayName)}
                volume={volume}
                onRegisterSave={(fn) => { draftSaveFnRef.current = fn; }}
                onRegisterCheckConsistency={(fn) => { draftCheckConsistencyFnRef.current = fn; }}
                onRegisterClose={(fn) => { draftCloseFnRef.current = fn; }}
                onHasUnsavedChanges={setHasUnsavedDraftChanges}
            />
          )}

          {gameState.currentScreen === ScreenState.CASE_HUB && currentCase && (
            <CaseHub 
              key="screen-hub"
              caseData={currentCase} 
              evidenceDiscovered={gameState.evidenceDiscovered}
              timelineStatements={gameState.timelineStatementsDiscovered}
              notes={gameState.notes}
              officerHintsRemaining={gameState.officerHintsRemaining}
              officerHistory={gameState.officerHistory}
              isThinking={thinkingSuspectIds.has('__officer__')}
              onStartInterrogation={startInterrogation}
              onNavigate={navigateTo}
              onSendOfficerMessage={handleSendOfficerMessage}
              unreadSuspectIds={unreadSuspects}
              thinkingSuspectIds={thinkingSuspectIds}
              newEvidenceTitles={newEvidenceTitles}
              newTimelineIds={newTimelineIds}
              onClearNewEvidence={(title) => {
                setNewEvidenceTitles(prev => {
                  const next = new Set(prev);
                  next.delete(title);
                  return next;
                });
              }}
              onClearAllNewEvidence={() => setNewEvidenceTitles(new Set())}
              onClearNewTimeline={() => setNewTimelineIds(new Set())}
              onClearSingleTimelineId={(id) => {
                setNewTimelineIds(prev => {
                  const next = new Set(prev);
                  next.delete(id);
                  return next;
                });
              }}
              initialMobileTab={previousScreenRef.current === ScreenState.INTERROGATION || previousScreenRef.current === ScreenState.ACCUSATION ? 'BOARD' : 'HQ'}
              initialAccordion={boardAccordionTab}
              onAccordionChange={setBoardAccordionTab}
              scrollToSuspectId={previousScreenRef.current === ScreenState.INTERROGATION ? gameState.currentSuspectId : undefined}
              suspectEmotions={gameState.suspectEmotions}
            />
          )}

          {gameState.currentScreen === ScreenState.INTERROGATION && currentCase && gameState.currentSuspectId && (
            <Interrogation 
              key="screen-interrogation"
              activeCase={currentCase}
              suspect={currentCase.suspects.find(s => s.id === gameState.currentSuspectId)!}
              chatHistory={gameState.chatHistory[gameState.currentSuspectId] || []}
              aggravationLevel={gameState.aggravationLevels[gameState.currentSuspectId] || 0}
              emotion={gameState.suspectEmotions[gameState.currentSuspectId] || Emotion.NEUTRAL}
              partnerEmotion={gameState.partnerEmotion}
              suspectTurnIds={gameState.suspectTurnIds}
              evidenceDiscovered={gameState.evidenceDiscovered}
              timelineStatementsDiscovered={gameState.timelineStatementsDiscovered}
              suggestions={currentSuggestions}
              isThinking={thinkingSuspectIds.has(gameState.currentSuspectId!)}
              sidekickComment={gameState.sidekickComment}
              partnerCharges={gameState.partnerCharges}
              gameTime={gameState.gameTime}
              soundEnabled={!isMuted}
              volume={volume}
              onSendMessage={handleSendMessage}
              onCollectEvidence={collectEvidence}
              onSwitchSuspect={startInterrogation}
              onForceEvidence={handleForceEvidence}
              onPartnerAction={handlePartnerAction}
              mobileIntelOpen={mobileIntelOpen}
              onCloseMobileIntel={() => setMobileIntelOpen(false)}
              isAdmin={isAdmin}
              userId={user?.uid}
              unreadSuspectIds={unreadSuspects}
              thinkingSuspectIds={thinkingSuspectIds}
              onClearUnread={(suspectId) => {
                setUnreadSuspects(prev => {
                  const next = new Map(prev);
                  next.delete(suspectId);
                  return next;
                });
              }}
            />
          )}

          {gameState.currentScreen === ScreenState.ACCUSATION && currentCase && (
            <Accusation 
              key="screen-accusation"
              suspects={currentCase.suspects} 
              onAccuse={makeAccusation}
              onBack={() => navigateTo(ScreenState.CASE_HUB)}
            />
          )}

          {gameState.currentScreen === ScreenState.ENDGAME && currentCase && (
            <EndGame 
              key="screen-endgame"
              gameResult={gameState.gameResult} 
              caseData={currentCase}
              accusedIds={gameState.accusedSuspectIds}
              evidenceDiscovered={gameState.evidenceDiscovered}
              onReset={resetGame}
              caseStats={currentCaseStats}
              userVote={currentUserVote}
              onVote={handleVote}
              suspectsSpoken={Object.keys(gameState.chatHistory).filter(
                sid => (gameState.chatHistory[sid] || []).some(m => m.sender === 'player')
              ).length}
              timelineFound={gameState.timelineStatementsDiscovered.length}
            />
          )}
        </>
      )}

      {showPublishConfirm && (
        <Overlay>
          <ModalBox>
            <ModalTitle>⚠ WARNING ⚠</ModalTitle>
            <ModalText>
              Uploading this case to the Network will make it <strong>PUBLICLY AVAILABLE</strong>.
            </ModalText>
            <ModalButtonRow>
              <CancelButton onClick={() => setShowPublishConfirm(false)}>[ Cancel ]</CancelButton>
              <ConfirmButton onClick={executePublish}>[ CONFIRM UPLOAD ]</ConfirmButton>
            </ModalButtonRow>
          </ModalBox>
        </Overlay>
      )}

      {pendingPublishDraftId && (
        <Overlay>
          <ModalBox>
            <ModalTitle>⚠ WARNING ⚠</ModalTitle>
            <ModalText>
              Uploading this case to the Network will make it <strong>PUBLICLY AVAILABLE</strong>.
            </ModalText>
            <ModalButtonRow>
              <CancelButton onClick={() => setPendingPublishDraftId(null)}>[ Cancel ]</CancelButton>
              <ConfirmButton onClick={executePublishDraft}>[ CONFIRM UPLOAD ]</ConfirmButton>
            </ModalButtonRow>
          </ModalBox>
        </Overlay>
      )}

      {caseToDelete && (
        <Overlay>
          <ModalBox>
            <ModalTitle>⚠ DELETE CASE ⚠</ModalTitle>
            <ModalText>
              Are you sure you want to delete this case permanently? This action cannot be undone.
            </ModalText>
            <ModalButtonRow>
              <CancelButton onClick={() => setCaseToDelete(null)}>[ Cancel ]</CancelButton>
              <ConfirmButton onClick={confirmDeleteCase}>[ DELETE ]</ConfirmButton>
            </ModalButtonRow>
          </ModalBox>
        </Overlay>
      )}

      {myCaseToDelete && (
        <Overlay>
          <ModalBox>
            <ModalTitle>⚠ DELETE CASE ⚠</ModalTitle>
            <ModalText>
              Are you sure you want to permanently delete this case? If it's published, it will also be removed from the Network. <strong>This cannot be undone.</strong>
            </ModalText>
            <ModalButtonRow>
              <CancelButton onClick={() => setMyCaseToDelete(null)}>[ Cancel ]</CancelButton>
              <ConfirmButton onClick={confirmDeleteMyCase}>[ DELETE PERMANENTLY ]</ConfirmButton>
            </ModalButtonRow>
          </ModalBox>
        </Overlay>
      )}

      {draftToDelete && (
        <Overlay>
          <ModalBox>
            <ModalTitle>⚠ DELETE DRAFT ⚠</ModalTitle>
            <ModalText>
              Are you sure you want to delete this draft? <strong>This cannot be undone.</strong>
            </ModalText>
            <ModalButtonRow>
              <CancelButton onClick={() => setDraftToDelete(null)}>[ Cancel ]</CancelButton>
              <ConfirmButton onClick={confirmDeleteDraft}>[ DELETE ]</ConfirmButton>
            </ModalButtonRow>
          </ModalBox>
        </Overlay>
      )}

    </Layout>
    </>
  );
};

export default App;
