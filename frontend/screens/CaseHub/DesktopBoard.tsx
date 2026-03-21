
import React from 'react';
import { type } from '../../theme';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { CaseData, ScreenState, Evidence, Emotion } from '../../types';
import TimelineModal from '@/components/TimelineModal';

// --- Styled Components ---

const BoardSection = styled.div`
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 20px var(--screen-edge-horizontal) calc(var(--screen-edge-bottom) + 50px + 10px) var(--screen-edge-horizontal);
  @media (max-width: 768px) { display: none; }
`;

const MainLayout = styled.div`
  display: flex;
  gap: calc(var(--space) * 3);
  flex: 1;
  overflow: hidden;
  margin-top: 0;
  container-type: inline-size;
  @media (max-width: 768px) { display: none; }
`;

const DesktopTimelinePanel = styled.div`
  width: 380px;
  flex-shrink: 0;
  display: none;
  flex-direction: column;
  border: 2px solid #415a77;
  background: #0d1b2a;
  overflow: hidden;
  @container (min-width: 1300px) { display: flex; }
`;

const DesktopTimelinePanelHeader = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space);
  padding: calc(var(--space) * 2) calc(var(--space) * 2);
  border-bottom: 1px solid var(--color-border);
  background: rgba(0, 0, 0, 0.3);
  color: #4af;
  ${type.body}
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 1px;
  flex-shrink: 0;
  svg { width: 18px; height: 18px; }
`;

const EvidenceBoard = styled.div`
  flex: 1;
  border: 2px dashed var(--color-border);
  background: rgba(0,0,0,0.2);
  padding: calc(var(--space) * 3);
  overflow-y: auto;
  position: relative;
  display: flex;
  flex-direction: column;
`;

const EvidenceBoardTitle = styled.h2`
  margin-top: 0;
  margin-bottom: calc(var(--space) * 3);
  font-size: var(--type-h3);
  color: #aaa;
  border-bottom: 1px dashed #444;
  padding-bottom: var(--space);
  font-weight: normal;
`;

const EvidenceBoardTitleHighlight = styled.span`
  color: var(--color-text-bright);
  font-weight: bold;
`;

const EvidenceGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--space) * 3);
  justify-content: center;
  align-items: flex-start;
  width: 100%;
  align-content: flex-start;
`;

const EvidenceItemBase = styled(motion.div)`
  background: var(--color-polaroid-bg);
  color: var(--color-text-inverse);
  padding: calc(var(--space) * 2) calc(var(--space) * 2) calc(var(--space) * 3) calc(var(--space) * 2);
  width: 260px;
  box-shadow: 3px 3px 12px var(--color-polaroid-shadow);
  font-family: 'Caveat', cursive;
  font-size: var(--type-body-lg);
  line-height: 1.1;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  position: relative;
  @media (min-width: 769px) {
    &:hover { z-index: 50; box-shadow: 8px 8px 20px rgba(0,0,0,0.7); }
  }
`;

const PolaroidImage = styled.div<{ $src?: string }>`
  width: 100%;
  aspect-ratio: 1;
  background-color: var(--color-border);
  background-image: ${props => props.$src ? `url(${props.$src})` : 'none'};
  background-size: cover;
  background-position: center;
  image-rendering: pixelated;
  border: 1px solid #ddd;
  margin-bottom: var(--space);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-subtle);
  font-size: var(--type-small);
`;

const PolaroidText = styled.div`
  text-align: center;
  width: 100%;
  strong { display: block; font-size: var(--type-h3); margin-bottom: 0; font-weight: 700; }
  span { font-size: var(--type-body-lg); color: var(--color-text-inverse); display: block; padding: 0 5px; }
`;

const NoteItem = styled(EvidenceItemBase)`
  background: var(--color-note-yellow);
  width: 260px;
  min-height: 180px;
  align-items: flex-start;
  font-family: 'Caveat', cursive;
  font-size: var(--type-h3);
  color: var(--color-text-inverse);
  strong {
    display: block; width: 100%;
    border-bottom: 1px dashed #990;
    margin-bottom: var(--space); font-weight: 700;
  }
`;

/** Pulsing dot for notification badges */
const NotifDot = styled.span<{ $color: string; $size?: number }>`
  width: ${props => props.$size || 8}px;
  height: ${props => props.$size || 8}px;
  border-radius: 50%;
  background: ${props => props.$color};
  box-shadow: 0 0 6px ${props => props.$color}, 0 0 12px ${props => props.$color}40;
  animation: notif-pulse 1.5s ease-in-out infinite;
  flex-shrink: 0;
`;

/** Absolutely positioned notification dot (top-right corner) */
const CornerNotifDot = styled(NotifDot)`
  position: absolute;
  top: -4px;
  right: -4px;
  z-index: 10;
`;

const InlineNotifDot = styled(NotifDot)`
  margin-left: 6px;
`;

const SidePanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: calc(var(--space) * 2);
  width: 320px;
  flex-shrink: 0;
  z-index: 20;
`;

const ChiefWidgetRow = styled.div`
  background: #0d1b2a;
  border: 2px solid #415a77;
  padding: var(--space);
  box-shadow: 0 4px 10px rgba(0,0,0,0.5);
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: calc(var(--space) * 2);
`;

const OfficerPortrait = styled.img`
  border: 2px solid var(--color-officer-border);
  image-rendering: pixelated;
  width: 120px;
  height: 120px;
  object-fit: cover;
  flex-shrink: 0;
`;

const OfficerInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space);
  flex: 1;
  min-width: 0;
`;

const OfficerName = styled.span`
  font-weight: bold;
  font-size: var(--type-body);
  color: var(--color-officer-text);
`;

const BatteryStatus = styled.span<{ $low: boolean }>`
  font-size: var(--type-small);
  color: ${props => props.$low ? '#b00' : 'var(--color-officer-text)'};
`;

const SecureLineButton = styled.button`
  background: #1b263b;
  color: #e0e1dd;
  border: 1px solid #415a77;
  padding: var(--space);
  cursor: pointer;
  font-family: inherit;
  ${type.small}
  text-transform: uppercase;
  &:hover:not(:disabled) { background: var(--color-officer-button-hover); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const BriefingWidget = styled.div`
  background: #111;
  border: 1px solid #444;
  padding: calc(var(--space) * 2);
  display: flex;
  flex-direction: column;
  gap: var(--space);
  flex: 1;
  overflow-y: auto;
  box-shadow: 0 4px 10px rgba(0,0,0,0.5);
  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-thumb { background: var(--color-border); }
  h3 {
    margin: 0; color: var(--color-text-subtle);
    ${type.bodyLg}
    text-transform: uppercase; letter-spacing: 1px;
    border-bottom: 1px solid var(--color-border); padding-bottom: var(--space);
  }
  p {
    margin: 0; ${type.h3} line-height: 1.4;
    color: var(--color-text); font-family: 'VT323', monospace;
    text-transform: none;
  }
  .tags { display: flex; gap: var(--space); flex-wrap: wrap; padding-top: var(--space); }
`;

const Tag = styled.span<{ $color?: string }>`
  background: #222;
  color: ${props => props.$color || '#aaa'};
  padding: 0 var(--space);
  ${type.small}
  border: 1px solid var(--color-border);
  text-transform: uppercase;
`;

const TimelineButton = styled.button`
  background: #1b263b;
  color: #4af;
  border: 2px solid #415a77;
  padding: calc(var(--space) * 2);
  font-family: inherit;
  ${type.body}
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 4px 10px rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space);
  text-transform: uppercase;
  letter-spacing: 1px;
  position: relative;
  &:hover { background: #253855; border-color: var(--color-accent-blue); }
  svg { width: 20px; height: 20px; }
  @container (min-width: 1300px) { display: none; }
`;

const AccuseButton = styled.button`
  background: #700;
  color: var(--color-text-bright);
  border: 2px solid #a00;
  padding: calc(var(--space) * 2);
  font-family: inherit;
  ${type.bodyLg}
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 4px 10px rgba(0,0,0,0.5);
  &:hover { background: #900; transform: scale(1.02); }
`;

// --- Props ---

interface DesktopBoardProps {
  caseData: CaseData;
  evidenceDiscovered: Evidence[];
  timelineStatements: any[];
  notes: Record<string, string[]>;
  officerName: string;
  officerPortrait: string;
  officerHintsRemaining: number;
  newEvidenceTitles: Set<string>;
  newTimelineIds: Set<string>;
  selectedEvidenceId: string | null;
  isTimelineOpen: boolean;
  onOpenLightbox: (item: Evidence, evidenceKey: string) => void;
  onOpenChat: () => void;
  onOpenTimeline: () => void;
  onCloseTimeline: () => void;
  onNavigate: (screen: ScreenState) => void;
  onClearNewEvidence?: (title: string) => void;
  onClearNewTimeline?: () => void;
  onClearSingleTimelineId?: (id: string) => void;
}

const DesktopBoard: React.FC<DesktopBoardProps> = ({
  caseData,
  evidenceDiscovered,
  timelineStatements,
  notes,
  officerName,
  officerPortrait,
  officerHintsRemaining,
  newEvidenceTitles,
  newTimelineIds,
  selectedEvidenceId,
  isTimelineOpen,
  onOpenLightbox,
  onOpenChat,
  onOpenTimeline,
  onCloseTimeline,
  onNavigate,
  onClearNewEvidence,
  onClearNewTimeline,
  onClearSingleTimelineId,
}) => {
  const getDiffColor = (d: string) => {
    if (d === 'Hard') return '#f55';
    if (d === 'Medium') return '#fa0';
    return '#5f5';
  };

  return (
    <>
      <BoardSection>
        <MainLayout>
          <DesktopTimelinePanel id="timeline-panel">
            <DesktopTimelinePanelHeader>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              TIMELINE ({timelineStatements.length})
              {newTimelineIds.size > 0 && (
                <InlineNotifDot $color="#4af" />
              )}
            </DesktopTimelinePanelHeader>
            <TimelineModal
              statements={timelineStatements}
              suspects={caseData.suspects}
              onClose={() => { onClearNewTimeline?.(); }}
              inline
              newTimelineIds={newTimelineIds}
              onHoverClearId={onClearSingleTimelineId}
            />
          </DesktopTimelinePanel>

          <EvidenceBoard id="evidence-board">
            <EvidenceBoardTitle>
              EVIDENCE BOARD: <EvidenceBoardTitleHighlight>{caseData.title.toUpperCase()}</EvidenceBoardTitleHighlight>
            </EvidenceBoardTitle>

            <EvidenceGrid>
              {evidenceDiscovered.map((ev, i) => {
                const eKey = `ev-desktop-${ev.id || i}`;
                const isSelected = selectedEvidenceId === eKey;
                return (
                  <EvidenceItemBase
                    key={eKey}
                    layoutId={isSelected ? undefined : eKey}
                    onClick={() => !isSelected && onOpenLightbox(ev, eKey)}
                    data-cursor="pointer"
                    whileHover={!isSelected ? { scale: 1.05, rotate: 0 } : undefined}
                    style={{
                      rotate: isSelected ? 0 : Math.random() * 6 - 3,
                      visibility: isSelected ? 'hidden' : 'visible',
                      pointerEvents: isSelected ? 'none' : 'auto',
                    }}
                  >
                    {newEvidenceTitles.has(ev.title) && (
                      <CornerNotifDot $color="#fa0" $size={10} />
                    )}
                    <PolaroidImage $src={ev.imageUrl}>{!ev.imageUrl && 'No IMG'}</PolaroidImage>
                    <PolaroidText><strong>{ev.title}</strong><span>{ev.description}</span></PolaroidText>
                  </EvidenceItemBase>
                );
              })}
              {Object.entries(notes).flatMap(([sId, noteList]) =>
                (noteList as string[]).map((n, i) => (
                  <NoteItem key={`note-${sId}-${i}`} style={{ transform: `rotate(${Math.random() * 6 - 3}deg)` }}>
                    <strong>Note on {caseData.suspects.find(s => s.id === sId)?.name}</strong>
                    {n}
                  </NoteItem>
                ))
              )}
            </EvidenceGrid>
          </EvidenceBoard>

          <SidePanel>
            <BriefingWidget id="mission-briefing">
              <h3>Mission Briefing</h3>
              <div className="tags">
                <Tag>{caseData.type}</Tag>
                <Tag $color={getDiffColor(caseData.difficulty)}>{caseData.difficulty}</Tag>
              </div>
              <p>{caseData.description}</p>
            </BriefingWidget>

            <ChiefWidgetRow>
              <OfficerPortrait src={officerPortrait} alt={officerName} />
              <OfficerInfo>
                <OfficerName>{officerName.toUpperCase()}</OfficerName>
                <BatteryStatus $low={officerHintsRemaining <= 3}>
                  BATT: {officerHintsRemaining * 10}%
                </BatteryStatus>
                <SecureLineButton id="secure-line" onClick={onOpenChat}>
                  [SECURE LINE]
                </SecureLineButton>
              </OfficerInfo>
            </ChiefWidgetRow>

            <TimelineButton id="timeline-button" onClick={onOpenTimeline}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              TIMELINE
              {newTimelineIds.size > 0 && (
                <InlineNotifDot $color="#4af" />
              )}
            </TimelineButton>

            <AccuseButton onClick={() => onNavigate(ScreenState.ACCUSATION)}>
              MAKE ACCUSATION
            </AccuseButton>
          </SidePanel>
        </MainLayout>
      </BoardSection>

      {isTimelineOpen && (
        <TimelineModal
          statements={timelineStatements}
          suspects={caseData.suspects}
          onClose={() => { onCloseTimeline(); onClearNewTimeline?.(); }}
          newTimelineIds={newTimelineIds}
        />
      )}
    </>
  );
};

export default DesktopBoard;
