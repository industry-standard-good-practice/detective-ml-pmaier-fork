
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { type } from '../../theme';
import styled from 'styled-components';
import { LayoutGroup } from 'framer-motion';
import { CaseData, ScreenState, ChatMessage, Evidence, Emotion } from '../../types';
import SuspectCardDock from '@/components/SuspectCardDock';
import { useOnboarding, OnboardingStep } from '../../contexts/OnboardingContext';

// Sub-components
import MobileBoard from './MobileBoard';
import DesktopBoard from './DesktopBoard';
import OfficerChatModal from './OfficerChatModal';
import EvidenceLightbox from './EvidenceLightbox';

// --- Styled Components ---

const HubContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  overflow: hidden;
  --card-spacing: 190px;
`;

const MobileTabBar = styled.div`
  display: none;
  @media (max-width: 768px) {
    display: flex;
    background: #111;
    border-top: 1px solid #333;
    padding: 0 var(--screen-edge-horizontal);
    padding-bottom: var(--screen-edge-bottom);
    flex-shrink: 0;
  }
`;

const TabItem = styled.button<{ $active: boolean }>`
  flex: 1;
  background: transparent;
  color: ${props => props.$active ? 'var(--color-text-bright)' : 'var(--color-text-dim)'};
  border: none;
  border-top: 3px solid ${props => props.$active ? 'var(--color-accent-green)' : 'transparent'};
  padding: calc(var(--space) * 2) var(--space);
  font-family: inherit;
  ${type.bodyLg}
  font-weight: bold;
  text-transform: uppercase;
`;

const MobileContentArea = styled.div<{ $noScroll?: boolean }>`
  display: none;
  @media (max-width: 768px) {
    display: flex;
    flex: 1;
    flex-direction: column;
    overflow-y: ${props => props.$noScroll ? 'hidden' : 'auto'};
    gap: ${props => props.$noScroll ? '0' : '15px'};
    min-height: 0;
  }
`;

const ChiefWidget = styled.div`
  background: #0d1b2a;
  border: 2px solid #415a77;
  padding: var(--space);
  box-shadow: 0 4px 10px rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
  gap: var(--space);
  @media (max-width: 768px) {
    width: 100%;
    flex-shrink: 1;
    gap: var(--space);
    justify-content: center;
    min-height: 0;
    overflow: hidden;
  }
`;

const ChiefStatus = styled.div`
  display: flex;
  gap: var(--space);
  align-items: center;
  color: var(--color-officer-text);
  img {
    border: 2px solid var(--color-officer-border);
    image-rendering: pixelated;
    width: 40px; height: 40px; object-fit: cover;
  }
  div { display: flex; flex-direction: column; }
  @media (max-width: 768px) {
    flex-direction: row;
    text-align: left;
    align-items: center;
    gap: calc(var(--space) * 2);
    img { width: 80px; height: 80px; flex-shrink: 0; }
    div { align-items: flex-start; }
    div span:first-child { ${type.h3} color: var(--color-text-bright); }
    div span:last-child { ${type.bodyLg} }
  }
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
  @media (max-width: 768px) {
    padding: calc(var(--space) * 2);
    ${type.bodyLg}
    background: #253855;
  }
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
    ${type.bodyLg} text-transform: uppercase; letter-spacing: 1px;
    border-bottom: 1px solid var(--color-border); padding-bottom: var(--space);
  }
  p {
    margin: 0; ${type.bodyLg} line-height: 1.6;
    color: var(--color-text); font-family: 'VT323', monospace;
  }
  .tags { display: flex; gap: var(--space); flex-wrap: wrap; }
  @media (max-width: 768px) {
    width: 100%; max-height: none;
    h3 { ${type.bodyLg} color: var(--color-text-muted); }
    p { ${type.bodyLg} line-height: 1.6; }
    .tags { gap: calc(var(--space) * 2); }
  }
`;

const Tag = styled.span<{ $color?: string }>`
  background: #222;
  color: ${props => props.$color || '#aaa'};
  padding: 0 var(--space);
  ${type.small}
  border: 1px solid var(--color-border);
  text-transform: uppercase;
  @media (max-width: 768px) {
    ${type.body}
    padding: var(--space) var(--space);
  }
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
  flex-shrink: 0;
  &:hover { background: #900; transform: scale(1.02); }
  @media (max-width: 768px) {
    ${type.h3}
    padding: calc(var(--space) * 3);
  }
`;

const MobileHQContent = styled.div`
  padding: calc(var(--space) * 2);
  display: flex;
  flex-direction: column;
  gap: calc(var(--space) * 2);
  flex: 1;
  min-height: 0;
  overflow: hidden;
`;

const MobileChiefWidget = styled(ChiefWidget)`
  flex-shrink: 1;
  min-height: 0;
`;

const OfficerNameLabel = styled.span`
  font-weight: bold;
`;

const BatteryLabel = styled.span<{ $low: boolean }>`
  color: ${props => props.$low ? '#b00' : 'var(--color-officer-text)'};
`;

const MobileBriefingWidget = styled(BriefingWidget)`
  flex: 1;
  min-height: 30vh;
  overflow-y: auto;
`;

// --- Props ---

interface CaseHubProps {
  caseData: CaseData;
  evidenceDiscovered: Evidence[];
  timelineStatements: any[];
  notes: Record<string, string[]>;
  officerHintsRemaining: number;
  officerHistory: ChatMessage[];
  isThinking: boolean;
  onStartInterrogation: (suspectId: string) => void;
  onNavigate: (screen: ScreenState) => void;
  onSendOfficerMessage: (text: string) => void;
  unreadSuspectIds?: Map<string, number>;
  initialMobileTab?: 'BOARD' | 'HQ';
  initialAccordion?: string;
  onAccordionChange?: (tab: string) => void;
  scrollToSuspectId?: string | null;
  thinkingSuspectIds?: Set<string>;
  newEvidenceTitles?: Set<string>;
  newTimelineIds?: Set<string>;
  onClearNewEvidence?: (title: string) => void;
  onClearAllNewEvidence?: () => void;
  onClearNewTimeline?: () => void;
  onClearSingleTimelineId?: (id: string) => void;
  suspectEmotions?: Record<string, string>;
}

const CaseHub: React.FC<CaseHubProps> = ({
  caseData,
  evidenceDiscovered,
  timelineStatements,
  notes,
  officerHintsRemaining,
  officerHistory,
  isThinking,
  onStartInterrogation,
  onNavigate,
  onSendOfficerMessage,
  unreadSuspectIds = new Map(),
  initialMobileTab = 'HQ',
  initialAccordion = 'evidence',
  onAccordionChange,
  scrollToSuspectId,
  thinkingSuspectIds = new Set(),
  newEvidenceTitles = new Set(),
  newTimelineIds = new Set(),
  onClearNewEvidence,
  onClearAllNewEvidence,
  onClearNewTimeline,
  onClearSingleTimelineId,
  suspectEmotions = {}
}) => {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [lightboxEvidence, setLightboxEvidence] = useState<{ title: string; description: string; imageUrl?: string; id?: string } | null>(null);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const [activeMobileTab, setActiveMobileTab] = useState<'BOARD' | 'HQ'>(initialMobileTab);
  const [openAccordion, setOpenAccordionLocal] = useState<string>(initialAccordion);

  const setOpenAccordion = (val: string | ((prev: string) => string)) => {
    setOpenAccordionLocal(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      onAccordionChange?.(next);
      return next;
    });
  };

  const ACCORDION_ORDER = ['evidence', 'timeline', 'suspects'] as const;
  const toggleAccordion = useCallback((key: string) => {
    setOpenAccordion(prev => {
      if (prev === key) {
        const idx = ACCORDION_ORDER.indexOf(key as any);
        return ACCORDION_ORDER[(idx + 1) % ACCORDION_ORDER.length];
      }
      return key;
    });
  }, []);

  // Clear notification dots when navigating away from a panel
  const prevAccordionRef = useRef(openAccordion);
  useEffect(() => {
    const prev = prevAccordionRef.current;
    prevAccordionRef.current = openAccordion;
    if (prev === openAccordion) return;
    if (prev === 'evidence') onClearAllNewEvidence?.();
    if (prev === 'timeline') onClearNewTimeline?.();
  }, [openAccordion]);

  const { startTour, completeStep } = useOnboarding();
  useEffect(() => { startTour(false); }, []);

  const openLightbox = (item: Evidence, evidenceKey: string) => {
    setSelectedEvidenceId(evidenceKey);
    setLightboxEvidence(item);
    onClearNewEvidence?.(item.title);
  };

  const closeLightbox = () => {
    setSelectedEvidenceId(null);
    setLightboxEvidence(null);
  };

  const getDiffColor = (d: string) => {
    if (d === 'Hard') return '#f55';
    if (d === 'Medium') return '#fa0';
    return '#5f5';
  };

  const officerName = caseData.officer?.name || "Chief";
  const officerRole = caseData.officer?.role || "Police Chief";
  const officerPortrait = caseData.officer?.portraits?.[Emotion.NEUTRAL] || '';

  return (
    <HubContainer>
      <LayoutGroup>
        {/* MOBILE: Board accordion */}
        <MobileBoard
          activeMobileTab={activeMobileTab}
          openAccordion={openAccordion}
          toggleAccordion={toggleAccordion}
          setOpenAccordion={setOpenAccordion}
          caseData={caseData}
          evidenceDiscovered={evidenceDiscovered}
          timelineStatements={timelineStatements}
          notes={notes}
          newEvidenceTitles={newEvidenceTitles}
          newTimelineIds={newTimelineIds}
          unreadSuspectIds={unreadSuspectIds}
          thinkingSuspectIds={thinkingSuspectIds}
          suspectEmotions={suspectEmotions}
          scrollToSuspectId={scrollToSuspectId}
          onStartInterrogation={onStartInterrogation}
        />

        {/* MOBILE: HQ tab */}
        {activeMobileTab === 'HQ' && (
          <MobileContentArea>
            <MobileHQContent>
              <MobileChiefWidget>
                <ChiefStatus>
                  <img src={officerPortrait} alt={officerName} />
                  <div>
                    <OfficerNameLabel>{officerName.toUpperCase()}</OfficerNameLabel>
                    <BatteryLabel $low={officerHintsRemaining <= 3}>
                      BATT: {officerHintsRemaining * 10}%
                    </BatteryLabel>
                  </div>
                </ChiefStatus>
                <SecureLineButton id="secure-line-mobile" onClick={() => setIsChatOpen(true)}>
                  [SECURE LINE]
                </SecureLineButton>
              </MobileChiefWidget>
              <MobileBriefingWidget id="mission-briefing-mobile">
                <div>
                  <h3>Mission Briefing</h3>
                  <div className="tags">
                    <Tag>{caseData.type}</Tag>
                    <Tag $color={getDiffColor(caseData.difficulty)}>{caseData.difficulty}</Tag>
                  </div>
                  <p>{caseData.description}</p>
                </div>
              </MobileBriefingWidget>
              <AccuseButton onClick={() => onNavigate(ScreenState.ACCUSATION)}>
                MAKE ACCUSATION
              </AccuseButton>
            </MobileHQContent>
          </MobileContentArea>
        )}

        {/* MOBILE: Tab bar */}
        <MobileTabBar id="mobile-tab-bar">
          <TabItem $active={activeMobileTab === 'HQ'} onClick={() => setActiveMobileTab('HQ')}>HQ</TabItem>
          <TabItem $active={activeMobileTab === 'BOARD'} onClick={() => setActiveMobileTab('BOARD')}>BOARD</TabItem>
        </MobileTabBar>

        {/* DESKTOP: Board */}
        <DesktopBoard
          caseData={caseData}
          evidenceDiscovered={evidenceDiscovered}
          timelineStatements={timelineStatements}
          notes={notes}
          officerName={officerName}
          officerPortrait={officerPortrait}
          officerHintsRemaining={officerHintsRemaining}
          newEvidenceTitles={newEvidenceTitles}
          newTimelineIds={newTimelineIds}
          selectedEvidenceId={selectedEvidenceId}
          isTimelineOpen={isTimelineOpen}
          onOpenLightbox={openLightbox}
          onOpenChat={() => setIsChatOpen(true)}
          onOpenTimeline={() => setIsTimelineOpen(true)}
          onCloseTimeline={() => setIsTimelineOpen(false)}
          onNavigate={onNavigate}
          onClearNewEvidence={onClearNewEvidence}
          onClearNewTimeline={onClearNewTimeline}
          onClearSingleTimelineId={onClearSingleTimelineId}
        />

        <SuspectCardDock
          suspects={caseData.suspects}
          onSelectSuspect={(id) => {
            completeStep(OnboardingStep.SUSPECT_CARDS, true);
            onStartInterrogation(id);
          }}
          inactiveActionLabel="TALK"
          unreadSuspectIds={unreadSuspectIds}
          thinkingSuspectIds={thinkingSuspectIds}
          onFlipCard={(flipped) => {
            if (flipped) completeStep(OnboardingStep.FLIP_CARD, false);
          }}
        />

        {isChatOpen && (
          <OfficerChatModal
            officerName={officerName}
            officerRole={officerRole}
            officerHistory={officerHistory}
            officerHintsRemaining={officerHintsRemaining}
            isThinking={isThinking}
            onSendMessage={onSendOfficerMessage}
            onClose={() => setIsChatOpen(false)}
          />
        )}

        <EvidenceLightbox
          selectedEvidenceId={selectedEvidenceId}
          evidence={lightboxEvidence}
          onClose={closeLightbox}
        />
      </LayoutGroup>
    </HubContainer>
  );
};

export default CaseHub;
