
import React, { useRef, useEffect } from 'react';
import styled from 'styled-components';
import { type } from '../../theme';
import { ChatMessage, Suspect, CaseData, Evidence } from '../../types';
import { sanitizeEvidenceRevealTitle } from '../../utils/evidenceRevealParsing';
import AsciiCelebration from '../../components/AsciiCelebration';
import { OnboardingOverlay, OnboardingHighlight, OnboardingTooltip } from '../../components/OnboardingTour';

// --- Styled Components ---

const ChatLogContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: calc(var(--space) * 2);
  padding: calc(var(--space) * 3);
  padding-bottom: calc(var(--space) * 3);

  /* Flush Scrollbar Styling */
  &::-webkit-scrollbar { width: 10px; }
  &::-webkit-scrollbar-track {
    background: var(--color-surface);
    border-left: 1px solid var(--color-border);
  }
  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border: 1px solid var(--color-border-strong);
  }
  &::-webkit-scrollbar-thumb:hover { background: var(--color-border-strong); }
  
  @media (max-width: 768px) {
    padding: var(--space) calc(var(--space) * 2);
  }
`;

const MessageBubble = styled.div<{ $sender: 'player' | 'suspect' | 'officer' | 'partner' | 'system', $isAction?: boolean, $customColor?: string }>`
  align-self: ${props => {
    if (props.$sender === 'system') return 'center';
    return props.$sender === 'player' ? 'flex-end' : 'flex-start';
  }};
  max-width: 80%;
  display: flex;
  flex-direction: column;
  text-align: ${props => props.$sender === 'system' ? 'center' : 'left'};
  
  .sender-name {
    ${type.small}
    color: ${props => {
    if (props.$sender === 'player') return 'var(--color-player-name)';
    if (props.$sender === 'partner') return 'var(--color-partner-name)';
    if (props.$sender === 'system') return 'var(--color-accent-red)';
    if (props.$customColor) return props.$customColor;
    return 'var(--color-suspect-name)';
  }};
    margin-bottom: var(--space);
    display: block;
    align-self: ${props => {
    if (props.$sender === 'system') return 'center';
    return props.$sender === 'player' ? 'flex-end' : 'flex-start';
  }};
    font-weight: bold;
    text-shadow: 0 0 2px rgba(0,0,0,0.5);
  }

  .text {
    color: ${props => {
    if (props.$sender === 'partner') return 'var(--color-partner-text)';
    if (props.$sender === 'system') return 'var(--color-system-text)';
    return 'var(--color-player-text)';
  }};
    ${type.bodyLg}
    line-height: 1.4;
    font-style: ${props => props.$isAction ? 'italic' : 'normal'};
    background: ${props => {
    if (props.$sender === 'player') return 'var(--color-player-bg)';
    if (props.$sender === 'partner') return 'var(--color-partner-bg)';
    if (props.$sender === 'system') return 'var(--color-system-bg)';
    return 'transparent';
  }};
    padding: ${props => (props.$sender === 'player' || props.$sender === 'partner' || props.$sender === 'system') ? '8px 12px' : '0'};
    border: ${props => {
    if (props.$isAction && props.$sender === 'player') return '1px dashed var(--color-player-name)';
    if (props.$sender === 'partner') return '1px solid var(--color-partner-border)';
    if (props.$sender === 'system') return '1px solid var(--color-accent-red)';
    return 'none';
  }};
  }

  .attachment {
    align-self: flex-end;
    ${type.small}
    background: var(--color-border);
    color: var(--color-text-muted);
    padding: 0 var(--space);
    margin-top: var(--space);
    border: 1px solid var(--color-border-strong);
  }
`;

const EvidenceChip = styled.div<{ $collected: boolean }>`
  margin-top: var(--space);
  background: ${props => props.$collected ? 'var(--color-evidence-collected)' : 'var(--color-evidence-yellow)'};
  color: var(--color-text-inverse);
  border: 2px dashed ${props => props.$collected ? 'var(--color-evidence-collected)' : 'var(--color-evidence-border)'};
  padding: var(--space) var(--space);
  ${type.small}
  font-weight: bold;
  cursor: ${props => props.$collected ? 'default' : 'pointer'};
  &[data-cursor] { cursor: ${props => props.$collected ? 'default' : 'pointer'}; }
  display: inline-block;
  align-self: flex-start;
  animation: fadeIn 0.5s;

  &:hover {
    background: ${props => props.$collected ? 'var(--color-evidence-collected)' : 'var(--color-text-bright)'};
  }
  
  &::before {
    content: '${props => props.$collected ? '✓ EVIDENCE LOGGED: ' : '⚠ NEW EVIDENCE: '} ';
  }
`;

// --- Helpers ---

const getShortEvidenceTitle = (ev: string | null | undefined) => {
  if (!ev) return '';
  const cleaned = sanitizeEvidenceRevealTitle(ev);
  if (cleaned.includes(':') && !/\b(WHERE_HIDDEN|DETAIL)\b/i.test(cleaned)) {
    return cleaned.split(':')[0].trim();
  }
  return cleaned;
};

const getSuspectColor = (suspectId: string) => {
  let hash = 0;
  for (let i = 0; i < suspectId.length; i++) {
    hash = suspectId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return `hsl(${h}, 70%, 70%)`;
};

// --- Component ---

interface ChatLogProps {
  chatHistory: ChatMessage[];
  suspect: Suspect;
  activeCase: CaseData;
  partnerName: string;
  isThinking: boolean;
  soundEnabled: boolean;
  volume: number;
  onCollectEvidence: (msgIndex: number, evidenceName: string, suspectId: string, evidenceIndex?: number) => void;
  // Evidence tooltip
  evidenceTooltipSeen: boolean;
  dismissEvidenceTooltip: () => void;
  scrollRef: React.RefObject<HTMLDivElement>;
}

const ChatLog: React.FC<ChatLogProps> = ({
  chatHistory,
  suspect,
  activeCase,
  partnerName,
  isThinking,
  soundEnabled,
  volume,
  onCollectEvidence,
  evidenceTooltipSeen,
  dismissEvidenceTooltip,
  scrollRef,
}) => {
  const [celebratingItem, setCelebratingItem] = React.useState<{ index: number, name: string, suspectId: string, evidenceIndex: number } | null>(null);
  const [showEvidenceTooltip, setShowEvidenceTooltip] = React.useState(false);
  const [evidenceChipRect, setEvidenceChipRect] = React.useState<DOMRect | null>(null);
  const evidenceChipRef = useRef<HTMLDivElement>(null);
  const evidenceTooltipBubbleRef = useRef<HTMLDivElement>(null);

  // Detect first uncollected evidence for tooltip (scans message index + evidence sub-index)
  let firstUncollectedMsgIdx = -1;
  let firstUncollectedEvIdx = -1;
  for (let mi = 0; mi < chatHistory.length; mi++) {
    const msg = chatHistory[mi];
    if (msg.evidence && msg.evidence.length > 0) {
      const collected = msg.isEvidenceCollected || [];
      for (let ei = 0; ei < msg.evidence.length; ei++) {
        if (!collected[ei]) {
          firstUncollectedMsgIdx = mi;
          firstUncollectedEvIdx = ei;
          break;
        }
      }
      if (firstUncollectedMsgIdx !== -1) break;
    }
  }
  const shouldShowEvidenceTooltip = !evidenceTooltipSeen && firstUncollectedMsgIdx !== -1;

  // Show evidence onboarding when first uncollected evidence exists (chat already scrolls to latest)
  useEffect(() => {
    if (shouldShowEvidenceTooltip && !showEvidenceTooltip) {
      setShowEvidenceTooltip(true);
    } else if (!shouldShowEvidenceTooltip) {
      setShowEvidenceTooltip(false);
      setEvidenceChipRect(null);
    }
  }, [shouldShowEvidenceTooltip]);

  // Poll evidence chip position for fixed tooltip
  useEffect(() => {
    if (!showEvidenceTooltip) return;
    const update = () => {
      if (evidenceChipRef.current) {
        const r = evidenceChipRef.current.getBoundingClientRect();
        const overlayEl = document.getElementById('evidence-tooltip-overlay');
        let offsetTop = 0;
        let offsetLeft = 0;
        if (overlayEl) {
          const overlayRect = overlayEl.getBoundingClientRect();
          offsetTop = overlayRect.top;
          offsetLeft = overlayRect.left;
        }
        setEvidenceChipRect({
          top: r.top - offsetTop,
          left: r.left - offsetLeft,
          width: r.width,
          height: r.height,
          bottom: r.bottom - offsetTop,
          right: r.right - offsetLeft,
        } as DOMRect);
      }
    };
    update();
    const interval = setInterval(update, 200);
    window.addEventListener('resize', update);
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', update);
    };
  }, [showEvidenceTooltip]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory, isThinking]);

  const findEvidenceImage = (rawName: string) => {
    const cleanName = getShortEvidenceTitle(rawName).toLowerCase();
    let match = suspect.hiddenEvidence.find(e => e.title.toLowerCase() === cleanName);
    if (match) return match.imageUrl;
    match = activeCase.initialEvidence.find(e => e.title.toLowerCase() === cleanName);
    if (match) return match.imageUrl;
    for (const s of activeCase.suspects) {
      match = s.hiddenEvidence.find(e => e.title.toLowerCase() === cleanName);
      if (match) return match.imageUrl;
    }
    return undefined;
  };

  // Evidence collection sound effect
  const playEvidenceSfx = () => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now + i * 0.08);
        gain.gain.linearRampToValueAtTime(0.15 * volume, now + i * 0.08 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.25);
      });
      setTimeout(() => ctx.close(), 500);
    } catch (e) {
      console.warn('Evidence SFX failed:', e);
    }
  };

  const handleEvidenceClick = (index: number, name: string, suspectId: string, evidenceIndex: number) => {
    if (showEvidenceTooltip) {
      dismissEvidenceTooltip();
      setShowEvidenceTooltip(false);
    }
    playEvidenceSfx();
    setCelebratingItem({ index, name, suspectId, evidenceIndex });
  };

  const handleCelebrationComplete = () => {
    if (celebratingItem) {
      onCollectEvidence(celebratingItem.index, celebratingItem.name, celebratingItem.suspectId, celebratingItem.evidenceIndex);
      setCelebratingItem(null);
    }
  };

  return (
    <>
      {/* Evidence Tooltip Overlay (rendered at container level because it's position: fixed) */}
      {showEvidenceTooltip && evidenceChipRect && (
        <OnboardingOverlay id="evidence-tooltip-overlay">
          <OnboardingHighlight
            initial={false}
            animate={{
              top: evidenceChipRect.top - 5,
              left: evidenceChipRect.left - 5,
              width: evidenceChipRect.width + 10,
              height: evidenceChipRect.height + 10,
            }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            onClick={() => {
              if (firstUncollectedMsgIdx !== -1 && firstUncollectedEvIdx !== -1) {
                const msg = chatHistory[firstUncollectedMsgIdx];
                if (msg?.evidence && msg.evidence[firstUncollectedEvIdx]) {
                  handleEvidenceClick(firstUncollectedMsgIdx, msg.evidence[firstUncollectedEvIdx], suspect.id, firstUncollectedEvIdx);
                }
              }
            }}
            style={{ pointerEvents: 'auto', cursor: 'pointer' }}
            data-cursor="pointer"
          />
          <OnboardingTooltip
            ref={evidenceTooltipBubbleRef}
            $position="top"
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              top: evidenceChipRect.top - (evidenceTooltipBubbleRef.current?.offsetHeight || 120) - 30,
              left: Math.max(10, Math.min(window.innerWidth - 310, evidenceChipRect.left + evidenceChipRect.width / 2 - 150)),
            }}
            transition={{ delay: 0.2 }}
          >
            <h4 style={{ margin: 0, color: '#0f0', textTransform: 'uppercase', fontFamily: "'VT323', monospace", fontSize: 'var(--type-h3)' }}>New Evidence!</h4>
            <p style={{ margin: 0, fontSize: 'var(--type-body)', lineHeight: 1.4, color: '#ccc' }}>Click on evidence to collect it and add it to your evidence board.</p>
          </OnboardingTooltip>
        </OnboardingOverlay>
      )}

      {celebratingItem && (
        <AsciiCelebration
          evidenceName={getShortEvidenceTitle(celebratingItem.name)}
          evidenceImage={findEvidenceImage(celebratingItem.name)}
          onComplete={handleCelebrationComplete}
        />
      )}

      <ChatLogContainer ref={scrollRef}>
        {chatHistory.map((msg, idx) => (
          <MessageBubble
            key={`${msg.sender}-${idx}-${(msg.text || '').substring(0, 10)}`}
            $sender={msg.sender}
            $isAction={msg.type === 'action'}
            $customColor={msg.sender === 'suspect' ? getSuspectColor(suspect.id) : undefined}
          >
            <span className="sender-name">
              {msg.sender === 'player' ? 'Detective' : msg.sender === 'partner' ? partnerName : msg.sender === 'system' ? 'SYSTEM' : suspect.name}
            </span>
            <span className="text">
              {msg.type === 'action' && '* '}{msg.text}{msg.type === 'action' && ' *'}
            </span>
            {msg.attachment && (
              <div className="attachment">📎 Evidence Shown: {msg.attachment.split(' | ').map(a => getShortEvidenceTitle(a)).join(', ')}</div>
            )}
            {msg.evidence && msg.evidence.length > 0 && msg.evidence.map((ev, evIdx) => {
              const isCollected = !!(msg.isEvidenceCollected && msg.isEvidenceCollected[evIdx]);
              const isFirstUncollected = idx === firstUncollectedMsgIdx && evIdx === firstUncollectedEvIdx && !isCollected;
              return (
                <EvidenceChip
                  key={`${idx}-ev-${evIdx}`}
                  ref={isFirstUncollected ? evidenceChipRef : undefined}
                  $collected={isCollected}
                  onClick={() => !isCollected && handleEvidenceClick(idx, ev, suspect.id, evIdx)}
                  data-cursor={isCollected ? undefined : 'pointer'}
                  style={showEvidenceTooltip && isFirstUncollected ? { position: 'relative', zIndex: 10001 } : undefined}
                >
                  {getShortEvidenceTitle(ev)}
                </EvidenceChip>
              );
            })}
          </MessageBubble>
        ))}
        {isThinking && (
          <div style={{ color: '#555', fontStyle: 'italic' }}>
            Thinking
            <span className="animate-typewriter-dots"></span>
          </div>
        )}
      </ChatLogContainer>
    </>
  );
};

export default ChatLog;
