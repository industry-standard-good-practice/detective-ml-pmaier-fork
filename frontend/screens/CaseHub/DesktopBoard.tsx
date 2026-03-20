
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

const SidePanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: calc(var(--space) * 2);
  width: 320px;
  flex-shrink: 0;
  z-index: 20;
`;

const ChiefWidget = styled.div`
  background: #0d1b2a;
  border: 2px solid #415a77;
  padding: var(--space);
  box-shadow: 0 4px 10px rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
  gap: var(--space);
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
    margin: 0; ${type.bodyLg} line-height: 1.6;
    color: var(--color-text); font-family: 'VT323', monospace;
  }
  .tags { display: flex; gap: var(--space); flex-wrap: wrap; }
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
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4af', boxShadow: '0 0 6px #4af, 0 0 12px rgba(68,170,255,0.4)', animation: 'notif-pulse 1.5s ease-in-out infinite', marginLeft: 6, flexShrink: 0 }} />
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
            <h2 style={{
              marginTop: 0, marginBottom: 'calc(var(--space) * 3)',
              fontSize: 'var(--type-h3)', color: '#aaa',
              borderBottom: '1px dashed #444', paddingBottom: 'var(--space)', fontWeight: 'normal'
            }}>
              EVIDENCE BOARD: <span style={{ color: 'var(--color-text-bright)', fontWeight: 'bold' }}>{caseData.title.toUpperCase()}</span>
            </h2>

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
                      position: 'relative',
                    }}
                  >
                    {newEvidenceTitles.has(ev.title) && (
                      <span style={{ position: 'absolute', top: -4, right: -4, zIndex: 10, width: 10, height: 10, borderRadius: '50%', background: '#fa0', boxShadow: '0 0 6px #fa0, 0 0 12px rgba(255,170,0,0.4)', animation: 'notif-pulse 1.5s ease-in-out infinite' }} />
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
            <BriefingWidget>
              <div id="mission-briefing" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space)' }}>
                <h3>Mission Briefing</h3>
                <div className="tags">
                  <Tag>{caseData.type}</Tag>
                  <Tag $color={getDiffColor(caseData.difficulty)}>{caseData.difficulty}</Tag>
                </div>
                <p>{caseData.description}</p>
              </div>
            </BriefingWidget>

            <ChiefWidget style={{ flexDirection: 'row', alignItems: 'center', gap: 'calc(var(--space) * 2)' }}>
              <img
                src={officerPortrait}
                alt={officerName}
                style={{
                  border: '2px solid var(--color-officer-border)',
                  imageRendering: 'pixelated' as const,
                  width: 120, height: 120,
                  objectFit: 'cover' as const,
                  flexShrink: 0,
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space)', flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 'bold', fontSize: 'var(--type-body)', color: 'var(--color-officer-text)' }}>{officerName.toUpperCase()}</span>
                <span style={{ fontSize: 'var(--type-small)', color: officerHintsRemaining > 3 ? 'var(--color-officer-text)' : '#b00' }}>
                  BATT: {officerHintsRemaining * 10}%
                </span>
                <SecureLineButton id="secure-line" onClick={onOpenChat}>
                  [SECURE LINE]
                </SecureLineButton>
              </div>
            </ChiefWidget>

            <TimelineButton id="timeline-button" onClick={onOpenTimeline} style={{ position: 'relative' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              TIMELINE
              {newTimelineIds.size > 0 && (
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4af', boxShadow: '0 0 6px #4af, 0 0 12px rgba(68,170,255,0.4)', animation: 'notif-pulse 1.5s ease-in-out infinite', marginLeft: 6, flexShrink: 0 }} />
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
