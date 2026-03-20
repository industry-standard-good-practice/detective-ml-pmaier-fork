
import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { CaseData, Suspect, ChatMessage, Emotion, Evidence, TimelineStatement } from '../../types';
import SuspectCard from '../../components/SuspectCard';
import SuspectCardDock from '../../components/SuspectCardDock';
import SuspectPortrait from '../../components/SuspectPortrait';
import { playAudioFromUrl, AudioPlayback } from '../../services/audioPlayer';
import { useOnboarding, OnboardingStep } from '../../contexts/OnboardingContext';

// Sub-components
import ChatLog from './ChatLog';
import ChatInput from './ChatInput';
import PartnerPanel from './PartnerPanel';
import MobileSuspectHeader from './MobileSuspectHeader';
import DebugPanel from './DebugPanel';

// --- Layout Styled Components ---

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  overflow: hidden;
  
  @media (max-width: 768px) {
    overflow-y: auto;
  }
  
  --card-spacing: 190px;
`;

const MainContent = styled.div`
  display: flex;
  flex: 1;
  overflow: hidden;
  padding: 20px var(--screen-edge-horizontal) calc(var(--screen-edge-bottom) + 50px + 10px) var(--screen-edge-horizontal);
  gap: calc(var(--space) * 3);
  position: relative;
  z-index: 1;
  justify-content: center;

  @media (max-width: 1280px) {
    gap: calc(var(--space) * 2);
    padding: 15px var(--screen-edge-horizontal) calc(var(--screen-edge-bottom) + 50px + 10px) var(--screen-edge-horizontal);
  }
  
  @media (max-width: 768px) {
    flex-direction: column;
    padding: 0;
    gap: 0;
  }
`;

const GhostLeftPanel = styled.div`
  flex: 1;
  min-width: 280px;
  height: 100%;
  pointer-events: none;
  transition: flex-basis 0.3s ease;
  
  @media (max-width: 768px) {
    display: none;
  }
`;

const ChatPanel = styled.div`
  flex: 0 1 900px;
  max-width: 900px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  padding: 0;
  height: 100%;
  background: rgba(0,0,0,0.2);
  position: relative;
  min-width: 350px;
  overflow: hidden; 
  
  @media (max-width: 768px) {
    min-width: 0;
    width: 100%;
    border: none;
    flex: 1;
    max-width: none;
  }
`;

const ModalOverlay = styled.div`
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.9);
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(var(--space) * 3);
`;

// --- Props ---

interface InterrogationProps {
  activeCase: CaseData;
  suspect: Suspect;
  chatHistory: ChatMessage[];
  aggravationLevel: number;
  emotion: Emotion;
  partnerEmotion: Emotion;
  suspectTurnIds: Record<string, string | undefined>;
  evidenceDiscovered: Evidence[];
  suggestions: (string | { label: string; text: string })[];
  isThinking: boolean;
  sidekickComment: string | null;
  partnerCharges: number;
  gameTime?: number;
  timelineStatementsDiscovered: TimelineStatement[];
  onSendMessage: (text: string, type: 'talk' | 'action', evidence?: string) => void;
  onCollectEvidence: (msgIndex: number, evidenceName: string, suspectId: string) => void;
  onSwitchSuspect: (suspectId: string) => void;
  onForceEvidence: (suspectId: string, evidenceTitle: string) => void;
  onPartnerAction: (type: 'goodCop' | 'badCop' | 'examine' | 'hint') => void;
  mobileIntelOpen?: boolean;
  onCloseMobileIntel?: () => void;
  soundEnabled?: boolean;
  volume?: number;
  isAdmin: boolean;
  userId?: string;
  unreadSuspectIds?: Map<string, number>;
  thinkingSuspectIds?: Set<string>;
  onClearUnread?: (suspectId: string) => void;
}

const Interrogation: React.FC<InterrogationProps> = ({
  activeCase,
  suspect,
  chatHistory,
  aggravationLevel,
  emotion,
  partnerEmotion,
  suspectTurnIds,
  evidenceDiscovered,
  suggestions,
  isThinking,
  sidekickComment,
  partnerCharges,
  gameTime,
  timelineStatementsDiscovered,
  onSendMessage,
  onCollectEvidence,
  onSwitchSuspect,
  onForceEvidence,
  onPartnerAction,
  mobileIntelOpen = false,
  onCloseMobileIntel,
  soundEnabled = true,
  volume = 0.7,
  isAdmin,
  userId,
  unreadSuspectIds = new Map(),
  thinkingSuspectIds = new Set(),
  onClearUnread
}) => {
  const [inputVal, setInputVal] = useState('');
  const { completeStep, isActive: isOnboarding, currentStep: onboardingStep, evidenceTooltipSeen, dismissEvidenceTooltip } = useOnboarding();
  const [inputType, setInputType] = useState<'talk' | 'action'>('talk');
  const [selectedEvidence, setSelectedEvidence] = useState<(Evidence | TimelineStatement)[]>([]);
  const [initialExamDone, setInitialExamDone] = useState(false);
  const [showMobileProfile, setShowMobileProfile] = useState(false);
  
  // Layout measurement
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPanelCenter, setLeftPanelCenter] = useState(170);
  const [leftPanelMiddle, setLeftPanelMiddle] = useState(400);
  const [leftPanelWidth, setLeftPanelWidth] = useState(300);
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
  
  // TTS refs
  const audioRef = useRef<AudioPlayback | null>(null);
  const voiceRef = useRef<string | null>(null);
  const volumeRef = useRef(volume);
  const [lastPlayedAudioUrl, setLastPlayedAudioUrl] = useState<string | null>(null);
  const isMounted = useRef(true);
  const prevChatLengthRef = useRef(chatHistory.length);
  const prevSuspectIdRef = useRef(suspect.id);
  const isFirstRenderRef = useRef(true);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // --- Layout Measurement ---
  useEffect(() => {
    const updateCenter = () => {
      if (leftPanelRef.current && containerRef.current) {
        const rect = leftPanelRef.current.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        setLeftPanelCenter(rect.left - containerRect.left + rect.width / 2);
        setLeftPanelMiddle(rect.top - containerRect.top + rect.height / 2);
        setLeftPanelWidth(rect.width);
        setViewportHeight(window.innerHeight);
      }
    };
    updateCenter();
    const timer = setTimeout(updateCenter, 500);
    const observer = new ResizeObserver(updateCenter);
    if (leftPanelRef.current) observer.observe(leftPanelRef.current);
    if (containerRef.current) observer.observe(containerRef.current);
    window.addEventListener('resize', updateCenter);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateCenter);
      clearTimeout(timer);
    };
  }, []);

  // Card size calculation
  const maxW = leftPanelWidth * 0.85;
  const maxH = (viewportHeight - 120) * 0.85;
  const MAX_CARD_HEIGHT = 700;
  const rawCardWidth = Math.min(maxW, maxH / 1.6);
  const rawCardHeight = rawCardWidth * 1.6;
  const activeCardHeight = Math.min(rawCardHeight, MAX_CARD_HEIGHT);
  const activeCardWidth = activeCardHeight / 1.6;

  const isCreator = userId === activeCase.authorId;
  const canDebug = isAdmin || isCreator;

  // --- TTS ---
  useEffect(() => {
    volumeRef.current = volume;
    if (audioRef.current) audioRef.current.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    if (!soundEnabled && audioRef.current) {
      audioRef.current.stop();
      audioRef.current = null;
    }
  }, [soundEnabled]);

  useEffect(() => {
    voiceRef.current = suspect.voice || null;
  }, [suspect.id]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (audioRef.current) {
        audioRef.current.stop();
        audioRef.current = null;
      }
    };
  }, []);

  // TTS Playback Logic
  useEffect(() => {
    const suspectChanged = suspect.id !== prevSuspectIdRef.current;
    const chatGrew = chatHistory.length > prevChatLengthRef.current;
    const isFirstRender = isFirstRenderRef.current;

    prevSuspectIdRef.current = suspect.id;
    prevChatLengthRef.current = chatHistory.length;
    isFirstRenderRef.current = false;

    if (isFirstRender || suspectChanged) {
      if (audioRef.current) {
        audioRef.current.stop();
        audioRef.current = null;
      }
      const lastMsg = chatHistory[chatHistory.length - 1];
      if ((lastMsg?.sender === 'suspect' || lastMsg?.sender === 'partner') && lastMsg?.audioUrl && soundEnabled && unreadSuspectIds.has(suspect.id)) {
        console.log("TTS Playing unread notification message", { text: lastMsg.text, audioUrl: lastMsg.audioUrl });
        setLastPlayedAudioUrl(lastMsg.audioUrl);
        playAudioFromUrl(lastMsg.audioUrl, volumeRef.current)
          .then(playback => { audioRef.current = playback; })
          .catch(e => console.error("Audio playback failed", e));
        onClearUnread?.(suspect.id);
      } else {
        setLastPlayedAudioUrl(lastMsg?.audioUrl || null);
        if (unreadSuspectIds.has(suspect.id)) onClearUnread?.(suspect.id);
      }
      return;
    }

    if (!chatGrew || chatHistory.length === 0) return;
    if (unreadSuspectIds.has(suspect.id)) onClearUnread?.(suspect.id);
    if (!soundEnabled) return;

    const lastMsg = chatHistory[chatHistory.length - 1];
    if ((lastMsg.sender === 'suspect' || lastMsg.sender === 'partner') && lastMsg.audioUrl && lastMsg.audioUrl !== lastPlayedAudioUrl) {
      console.log("TTS Playing message from audioUrl", { text: lastMsg.text, audioUrl: lastMsg.audioUrl });
      setLastPlayedAudioUrl(lastMsg.audioUrl);
      if (audioRef.current) {
        audioRef.current.stop();
        audioRef.current = null;
      }
      playAudioFromUrl(lastMsg.audioUrl, volumeRef.current)
        .then(playback => { audioRef.current = playback; })
        .catch(e => console.error("Audio playback failed", e));
    }
  }, [chatHistory, soundEnabled, suspect.id, lastPlayedAudioUrl, unreadSuspectIds, onClearUnread]);

  // Force Action type if Deceased
  useEffect(() => {
    if (suspect.isDeceased) {
      setInputType('action');
    } else {
      setInputType('talk');
    }
  }, [suspect.isDeceased, suspect.id]);

  // Initial exam check
  useEffect(() => {
    const hasExam = chatHistory.some(m => m.sender === 'partner' && m.type === 'action' && !m.text.includes("hint"));
    setInitialExamDone(hasExam);
  }, [chatHistory, suspect.id]);

  // --- Input Handlers ---
  const handleSend = () => {
    if (inputVal.trim() && !isThinking) {
      const evidenceTitle = selectedEvidence.length > 0
        ? selectedEvidence.map(ev => 'title' in ev ? ev.title : `Timeline: ${ev.time} - ${ev.statement}`).join(' | ')
        : undefined;
      onSendMessage(inputVal, inputType, evidenceTitle);
      setInputVal('');
      setSelectedEvidence([]);
      if (inputType === 'action' && !suspect.isDeceased) setInputType('talk');
    }
  };

  const toggleEvidence = (item: Evidence | TimelineStatement) => {
    setSelectedEvidence(prev => {
      const itemId = 'id' in item ? item.id : `ts-${(item as TimelineStatement).time}`;
      const exists = prev.some(ev => {
        const evId = 'id' in ev ? ev.id : `ts-${(ev as TimelineStatement).time}`;
        return evId === itemId;
      });
      if (exists) {
        return prev.filter(ev => {
          const evId = 'id' in ev ? ev.id : `ts-${(ev as TimelineStatement).time}`;
          return evId !== itemId;
        });
      }
      return [...prev, item];
    });
  };

  const isEvidenceSelected = (item: Evidence | TimelineStatement) => {
    const itemId = 'id' in item ? item.id : `ts-${(item as TimelineStatement).time}`;
    return selectedEvidence.some(ev => {
      const evId = 'id' in ev ? ev.id : `ts-${(ev as TimelineStatement).time}`;
      return evId === itemId;
    });
  };

  const cycleSuspect = (direction: 'prev' | 'next') => {
    const currentIndex = activeCase.suspects.findIndex(s => s.id === suspect.id);
    let nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex >= activeCase.suspects.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = activeCase.suspects.length - 1;
    onSwitchSuspect(activeCase.suspects[nextIndex].id);
  };

  // --- Derived State ---
  const isLocked = aggravationLevel >= 100 && !suspect.isDeceased;
  const showSuggestions = !chatHistory.some(m => m.sender === 'player' || m.sender === 'partner') && !suspect.isDeceased;
  const partnerName = activeCase.partner?.name || "Junior Detective Al";

  const formattedTime = gameTime
    ? new Date(gameTime).toLocaleString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    })
    : "10:05 PM September 12, 2030";

  const inputPlaceholder = isLocked
    ? "Suspect has requested a lawyer."
    : suspect.isDeceased
      ? "Perform action..."
      : inputType === 'talk' ? "Ask a question..." : "Slam the table, get a glass of water, etc...";

  return (
    <Container ref={containerRef}>
      <SuspectCardDock
        suspects={activeCase.suspects}
        activeSuspectId={suspect.id}
        activePosition={{ x: leftPanelCenter, y: leftPanelMiddle }}
        activeCardWidth={`${activeCardWidth}px`}
        activeCardHeight={`${activeCardHeight}px`}
        activeEmotion={emotion}
        activeAggravation={aggravationLevel}
        activeTurnId={suspectTurnIds[suspect.id]}
        onSelectSuspect={onSwitchSuspect}
        inactiveActionLabel="SWITCH"
        unreadSuspectIds={unreadSuspectIds}
        thinkingSuspectIds={thinkingSuspectIds}
        onFlipCard={(flipped) => {
          if (flipped) completeStep(OnboardingStep.FLIP_CARD, false);
        }}
      />

      <MainContent>
        <GhostLeftPanel ref={leftPanelRef} />

        <ChatPanel>
          <MobileSuspectHeader
            suspect={suspect}
            emotion={emotion}
            aggravationLevel={aggravationLevel}
            onShowProfile={() => setShowMobileProfile(true)}
            onCycleSuspect={cycleSuspect}
          />

          <DebugPanel
            suspect={suspect}
            canDebug={canDebug}
            onForceEvidence={onForceEvidence}
          />

          <div style={{ textAlign: 'center', padding: 'var(--space)', color: '#555', borderBottom: '1px solid #222' }}>
            {formattedTime}
          </div>

          <ChatLog
            chatHistory={chatHistory}
            suspect={suspect}
            activeCase={activeCase}
            partnerName={partnerName}
            isThinking={isThinking}
            soundEnabled={soundEnabled}
            volume={volume}
            onCollectEvidence={onCollectEvidence}
            evidenceTooltipSeen={evidenceTooltipSeen}
            dismissEvidenceTooltip={dismissEvidenceTooltip}
            scrollRef={scrollRef}
          />

          <ChatInput
            inputVal={inputVal}
            setInputVal={setInputVal}
            inputType={inputType}
            setInputType={setInputType}
            selectedEvidence={selectedEvidence}
            evidenceDiscovered={evidenceDiscovered}
            timelineStatementsDiscovered={timelineStatementsDiscovered}
            suggestions={suggestions}
            showSuggestions={showSuggestions}
            isLocked={isLocked}
            isThinking={isThinking}
            isDeceased={suspect.isDeceased}
            inputPlaceholder={inputPlaceholder}
            onSend={handleSend}
            toggleEvidence={toggleEvidence}
            isEvidenceSelected={isEvidenceSelected}
            inputRef={inputRef}
          />
        </ChatPanel>

        <PartnerPanel
          activeCase={activeCase}
          suspect={suspect}
          aggravationLevel={aggravationLevel}
          partnerEmotion={partnerEmotion}
          sidekickComment={sidekickComment}
          partnerCharges={partnerCharges}
          isLocked={isLocked}
          initialExamDone={initialExamDone}
          mobileIntelOpen={mobileIntelOpen}
          onCloseMobileIntel={onCloseMobileIntel}
          onPartnerAction={onPartnerAction}
        />
      </MainContent>

      {/* MOBILE PROFILE MODAL */}
      {showMobileProfile && (
        <ModalOverlay id="mobile-profile-modal" onClick={() => setShowMobileProfile(false)}>
          <div onClick={e => e.stopPropagation()}>
            <SuspectCard
              key={`mobile-profile-${suspect.id}-${isOnboarding}-${onboardingStep}`}
              id="active-suspect-card"
              suspect={suspect}
              emotion={emotion}
              aggravation={aggravationLevel}
              width="300px"
              height="450px"
              variant="default"
              initialFlipped={!(isOnboarding && onboardingStep === OnboardingStep.FLIP_CARD)}
              onFlip={(flipped) => {
                if (flipped) {
                  completeStep(OnboardingStep.FLIP_CARD, false);
                }
              }}
            />
          </div>
        </ModalOverlay>
      )}
    </Container>
  );
};

export default Interrogation;
