
import React, { useRef, useEffect, useCallback } from 'react';
import { type } from '../../theme';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { CaseData, Evidence, Emotion } from '../../types';
import SuspectCard from '@/components/SuspectCard';
import TimelineModal from '@/components/TimelineModal';
import { useOnboarding, OnboardingStep } from '../../contexts/OnboardingContext';

// --- Styled Components ---

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

const AccordionContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 1;
  min-height: 0;
  overflow: hidden;
`;

const AccordionButton = styled.button<{ $color: string; $isOpen: boolean }>`
  background: ${props => {
    const c = props.$color;
    if (c === 'green') return 'linear-gradient(180deg, #1a2a1a 0%, #0d1a0d 100%)';
    if (c === 'orange') return 'linear-gradient(180deg, #2a1f0a 0%, #1a1200 100%)';
    return 'linear-gradient(180deg, #1b263b 0%, #0d1520 100%)';
  }};
  color: ${props => {
    const c = props.$color;
    if (c === 'green') return '#0f0';
    if (c === 'orange') return '#f90';
    return '#4af';
  }};
  border: 2px solid ${props => {
    const c = props.$color;
    if (c === 'green') return props.$isOpen ? '#0f0' : '#1a3a1a';
    if (c === 'orange') return props.$isOpen ? '#f90' : '#3a2a0a';
    return props.$isOpen ? '#4af' : '#1a3a3a';
  }};
  padding: calc(var(--space) * 2);
  font-family: inherit;
  ${type.bodyLg}
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space);
  text-transform: uppercase;
  letter-spacing: 2px;
  flex-shrink: 0;
  transition: all 0.2s;
  position: relative;
  z-index: 1;
  svg { width: 20px; height: 20px; }
`;

const AccordionChevron = styled(motion.span)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  ${type.bodyLg}
  line-height: 1;
`;

const AccordionPanel = styled.div<{ $isOpen: boolean }>`
  display: grid;
  grid-template-rows: ${props => props.$isOpen ? '1fr' : '0fr'};
  transition: grid-template-rows 0.35s cubic-bezier(0.4, 0, 0.2, 1),
              flex-grow 0.35s cubic-bezier(0.4, 0, 0.2, 1),
              opacity ${props => props.$isOpen ? '0.15s ease 0.3s' : '0.1s ease 0s'};
  flex: ${props => props.$isOpen ? '1' : '0'};
  min-height: 0;
  opacity: ${props => props.$isOpen ? 1 : 0};
  overflow: hidden;
`;

const AccordionPanelContent = styled.div`
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.3);
`;

const AccordionInner = styled.div`
  padding: 0;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

const InlineTimelineWrap = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
`;

const InlineSuspectCarousel = styled.div`
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  gap: calc(var(--space) * 2);
  align-items: center;
  flex: 1;
  min-height: 0;
  height: 100%;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  user-select: none;
  -webkit-user-select: none;
  width: 100%;
  box-sizing: border-box;
  -webkit-overflow-scrolling: touch;
  padding: 25px 50vw 25px 50vw;
  &::-webkit-scrollbar { height: 4px; }
  &::-webkit-scrollbar-thumb { background: var(--color-border); }
`;

const CarouselCardItem = styled.div`
  scroll-snap-align: center;
  flex: 0 0 auto;
  width: auto;
  height: 100%;
  max-height: 450px;
  max-width: 280px;
  aspect-ratio: 280 / 450;
  display: flex;
  justify-content: center;
  align-items: center;
`;

const InlineEvidenceWrap = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: calc(var(--space) * 2);
  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-thumb { background: var(--color-border); }
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
  @media (max-width: 768px) { width: 100%; }
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
  @media (max-width: 768px) { width: 100%; }
`;

// --- Props ---

interface MobileBoardProps {
  activeMobileTab: 'BOARD' | 'HQ';
  openAccordion: string;
  toggleAccordion: (key: string) => void;
  setOpenAccordion: (val: string | ((prev: string) => string)) => void;
  caseData: CaseData;
  evidenceDiscovered: Evidence[];
  timelineStatements: any[];
  notes: Record<string, string[]>;
  newEvidenceTitles: Set<string>;
  newTimelineIds: Set<string>;
  unreadSuspectIds: Map<string, number>;
  thinkingSuspectIds: Set<string>;
  suspectEmotions: Record<string, Emotion>;
  scrollToSuspectId?: string | null;
  onStartInterrogation: (suspectId: string) => void;
}

const MobileBoard: React.FC<MobileBoardProps> = ({
  activeMobileTab,
  openAccordion,
  toggleAccordion,
  setOpenAccordion,
  caseData,
  evidenceDiscovered,
  timelineStatements,
  notes,
  newEvidenceTitles,
  newTimelineIds,
  unreadSuspectIds,
  thinkingSuspectIds,
  suspectEmotions,
  scrollToSuspectId,
  onStartInterrogation,
}) => {
  const { completeStep } = useOnboarding();
  const inlineCarouselRef = useRef<HTMLDivElement>(null);
  const inlineCarouselDrag = useRef({ isDown: false, startX: 0, scrollLeft: 0 });

  // Scroll to suspect on return
  useEffect(() => {
    if (!scrollToSuspectId || openAccordion !== 'suspects') return;
    const timer = setTimeout(() => {
      const el = inlineCarouselRef.current;
      if (!el) return;
      const card = el.querySelector(`[data-suspect-id="${scrollToSuspectId}"]`) as HTMLElement;
      if (card) card.scrollIntoView({ behavior: 'instant', inline: 'center', block: 'nearest' });
    }, 50);
    return () => clearTimeout(timer);
  }, [scrollToSuspectId, openAccordion]);

  // Mouse-drag scrolling for carousel
  useEffect(() => {
    const el = inlineCarouselRef.current;
    if (!el || openAccordion !== 'suspects') return;

    const state = inlineCarouselDrag.current;
    const onDragStart = (e: DragEvent) => e.preventDefault();
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      state.isDown = true;
      state.startX = e.pageX;
      state.scrollLeft = el.scrollLeft;
      (state as any).didDrag = false;
      el.style.cursor = 'grabbing';
      el.style.scrollSnapType = 'none';
      el.style.scrollBehavior = 'auto';
    };
    const onMove = (e: PointerEvent) => {
      if (!state.isDown) return;
      if (Math.abs(e.pageX - state.startX) > 5) (state as any).didDrag = true;
      el.scrollLeft = state.scrollLeft - (e.pageX - state.startX) * 1.5;
    };
    const onUp = () => {
      if (!state.isDown) return;
      state.isDown = false;
      el.style.cursor = 'grab';
      requestAnimationFrame(() => {
        el.style.scrollBehavior = 'smooth';
        el.style.scrollSnapType = 'x mandatory';
      });
      setTimeout(() => { (state as any).didDrag = false; }, 0);
    };
    const onClick = (e: MouseEvent) => {
      if ((state as any).didDrag) { e.stopPropagation(); e.preventDefault(); }
    };

    el.addEventListener('dragstart', onDragStart);
    el.addEventListener('pointerdown', onDown, { capture: true });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('click', onClick, { capture: true });
    return () => {
      el.removeEventListener('dragstart', onDragStart);
      el.removeEventListener('pointerdown', onDown, { capture: true });
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.removeEventListener('click', onClick, { capture: true });
    };
  }, [openAccordion]);

  if (activeMobileTab !== 'BOARD') return null;

  return (
    <MobileContentArea $noScroll>
      <AccordionContainer>
        {/* EVIDENCE ACCORDION */}
        <AccordionButton
          $color="orange" $isOpen={openAccordion === 'evidence'}
          onClick={() => toggleAccordion('evidence')}
          id="accordion-evidence" data-open={openAccordion === 'evidence' ? 'true' : 'false'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="18" rx="2" /><path d="M2 8h20" /><path d="M8 8v13" />
          </svg>
          EVIDENCE ({evidenceDiscovered.length})
          {newEvidenceTitles.size > 0 && (
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fa0', boxShadow: '0 0 6px #fa0, 0 0 12px rgba(255,170,0,0.4)', animation: 'notif-pulse 1.5s ease-in-out infinite', marginLeft: 6, flexShrink: 0 }} />
          )}
          <AccordionChevron animate={{ rotate: openAccordion === 'evidence' ? 180 : 0 }} transition={{ duration: 0.3 }}>▾</AccordionChevron>
        </AccordionButton>
        <AccordionPanel $isOpen={openAccordion === 'evidence'}>
          <AccordionPanelContent>
            <AccordionInner id="evidence-board-mobile">
              <InlineEvidenceWrap>
                <EvidenceGrid>
                  {[...evidenceDiscovered].sort((a, b) => {
                    const aNew = newEvidenceTitles.has(a.title) ? 0 : 1;
                    const bNew = newEvidenceTitles.has(b.title) ? 0 : 1;
                    return aNew - bNew;
                  }).map((ev, i) => (
                    <EvidenceItemBase key={ev.id || i} style={{ position: 'relative' }}>
                      {newEvidenceTitles.has(ev.title) && (
                        <span style={{ position: 'absolute', top: -4, right: -4, zIndex: 10, width: 10, height: 10, borderRadius: '50%', background: '#fa0', boxShadow: '0 0 6px #fa0, 0 0 12px rgba(255,170,0,0.4)', animation: 'notif-pulse 1.5s ease-in-out infinite' }} />
                      )}
                      <PolaroidImage $src={ev.imageUrl}>{!ev.imageUrl && 'No IMG'}</PolaroidImage>
                      <PolaroidText><strong>{ev.title}</strong><span>{ev.description}</span></PolaroidText>
                    </EvidenceItemBase>
                  ))}
                  {Object.entries(notes).flatMap(([sId, noteList]) =>
                    (noteList as string[]).map((n, i) => (
                      <NoteItem key={`note-${sId}-${i}`}>
                        <strong>{caseData.suspects.find(s => s.id === sId)?.name}</strong>
                        {n}
                      </NoteItem>
                    ))
                  )}
                </EvidenceGrid>
              </InlineEvidenceWrap>
            </AccordionInner>
          </AccordionPanelContent>
        </AccordionPanel>

        {/* TIMELINE ACCORDION */}
        <AccordionButton
          $color="blue" $isOpen={openAccordion === 'timeline'}
          onClick={() => toggleAccordion('timeline')}
          id="accordion-timeline" data-open={openAccordion === 'timeline' ? 'true' : 'false'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          TIMELINE ({timelineStatements.length})
          {newTimelineIds.size > 0 && (
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4af', boxShadow: '0 0 6px #4af, 0 0 12px rgba(68,170,255,0.4)', animation: 'notif-pulse 1.5s ease-in-out infinite', marginLeft: 6, flexShrink: 0 }} />
          )}
          <AccordionChevron animate={{ rotate: openAccordion === 'timeline' ? 180 : 0 }} transition={{ duration: 0.3 }}>▾</AccordionChevron>
        </AccordionButton>
        <AccordionPanel $isOpen={openAccordion === 'timeline'}>
          <AccordionPanelContent>
            <AccordionInner id="timeline-button-mobile">
              <InlineTimelineWrap>
                <TimelineModal
                  statements={timelineStatements}
                  suspects={caseData.suspects}
                  onClose={() => setOpenAccordion('evidence')}
                  inline
                  newTimelineIds={newTimelineIds}
                />
              </InlineTimelineWrap>
            </AccordionInner>
          </AccordionPanelContent>
        </AccordionPanel>

        {/* SUSPECTS ACCORDION */}
        <AccordionButton
          $color="green" $isOpen={openAccordion === 'suspects'}
          onClick={() => toggleAccordion('suspects')}
          id="accordion-suspects" data-open={openAccordion === 'suspects' ? 'true' : 'false'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          INTERROGATE SUSPECTS ({caseData.suspects.filter(s => !s.isDeceased).length})
          <AccordionChevron animate={{ rotate: openAccordion === 'suspects' ? 180 : 0 }} transition={{ duration: 0.3 }}>▾</AccordionChevron>
        </AccordionButton>
        <AccordionPanel $isOpen={openAccordion === 'suspects'}>
          <AccordionPanelContent>
            <AccordionInner>
              <InlineSuspectCarousel
                id="suspect-cards-container-mobile"
                ref={inlineCarouselRef}
                style={{ cursor: 'grab' }}
              >
                {caseData.suspects.map(s => (
                  <CarouselCardItem key={s.id} data-suspect-id={s.id}>
                    <SuspectCard
                      suspect={s}
                      emotion={suspectEmotions[s.id] || Emotion.NEUTRAL}
                      width="100%"
                      height="100%"
                      variant="default"
                      disableTouchRotation
                      notificationCount={unreadSuspectIds.get(s.id) || 0}
                      isLoading={thinkingSuspectIds.has(s.id)}
                      onAction={() => {
                        completeStep(OnboardingStep.SUSPECT_CARDS, true);
                        onStartInterrogation(s.id);
                      }}
                      actionLabel="INTERROGATE"
                    />
                  </CarouselCardItem>
                ))}
              </InlineSuspectCarousel>
            </AccordionInner>
          </AccordionPanelContent>
        </AccordionPanel>
      </AccordionContainer>
    </MobileContentArea>
  );
};

export default MobileBoard;
