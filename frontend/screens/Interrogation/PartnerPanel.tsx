
import React from 'react';
import styled, { keyframes } from 'styled-components';
import { type } from '../../theme';
import { CaseData, Suspect, Emotion } from '../../types';
import SuspectPortrait from '../../components/SuspectPortrait';

// --- Styled Components ---

const RightPanel = styled.div<{ $mobileOpen: boolean }>`
  flex: 1;
  min-width: 280px;
  display: flex;
  flex-direction: column;
  gap: calc(var(--space) * 3);
  transition: transform 0.3s ease;
  height: 100%; 
  overflow: hidden; 

  @media (max-width: 768px) {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: calc(100% - 24px);
    background: var(--color-surface);
    z-index: 100;
    padding: calc(var(--space) * 3);
    box-shadow: -10px 0 30px rgba(0,0,0,0.8);
    border-left: 2px solid var(--color-border);
    transform: translateX(${props => props.$mobileOpen ? '0' : '100%'});
    flex: none;
    min-width: 0;
    overflow-y: auto;
  }
`;

const IntelOverlay = styled.div<{ $visible: boolean }>`
  display: none;
  @media (max-width: 768px) {
    display: block;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 99;
    opacity: ${props => props.$visible ? 1 : 0};
    pointer-events: ${props => props.$visible ? 'auto' : 'none'};
    transition: opacity 0.3s ease;
  }
`;

const AggravationMeter = styled.div`
  border: 1px solid var(--color-border);
  padding: calc(var(--space) * 3);
  background: var(--color-surface);
  flex-shrink: 0; 
  
  h3 { margin: 0 0 10px 0; ${type.body} color: var(--color-text-subtle); text-transform: uppercase; }
`;

const ProgressBar = styled.div<{ $level: number }>`
  height: 20px;
  width: 100%;
  background: #222;
  position: relative;
  
  &::after {
    content: '';
    display: block;
    height: 100%;
    width: ${props => props.$level}%;
    background: ${props => props.$level > 80 ? 'red' : props.$level > 50 ? 'orange' : '#ccc'};
    transition: width 0.5s ease, background 0.5s ease;
    background-image: repeating-linear-gradient(
      45deg,
      transparent,
      transparent 5px,
      rgba(0,0,0,0.2) 5px,
      rgba(0,0,0,0.2) 10px
    );
  }
`;

const DeceasedBadge = styled.div`
  color: #f00; 
  font-weight: bold; 
  ${type.bodyLg}
  margin-top: var(--space);
  border: 2px solid #f00;
  padding: var(--space);
  text-align: center;
  text-transform: uppercase;
`;

const SidekickContainer = styled.div`
  flex: 1; 
  border: 1px solid var(--color-border);
  padding: calc(var(--space) * 3);
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  position: relative;
  gap: var(--space);
  overflow: hidden; 
  min-height: 0; 

  & > h3 { 
    margin: 0; 
    ${type.body} 
    color: var(--color-text-subtle); 
    text-transform: uppercase; 
  }
`;

const SidekickHeader = styled.div`
  display: flex;
  align-items: center;
  gap: calc(var(--space) * 2);
  flex-shrink: 0;
  padding-bottom: 0;
  border-bottom: none;
  margin-bottom: 0;

  .info {
    display: flex;
    flex-direction: column;
    
    h3 {
      margin: 0;
      ${type.h3}
      color: #9f9; 
      text-transform: uppercase;
    }
    
    span {
      ${type.body}
      color: #686;
    }
  }
`;

const BubbleScrollArea = styled.div`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding-right: var(--space);
  padding-top: calc(var(--space) * 2); 
  padding-bottom: var(--space);
  min-height: 0;
  
  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-thumb { background: var(--color-border); }
`;

const float = keyframes`
  0% { transform: translateY(0px); }
  50% { transform: translateY(-2px); }
  100% { transform: translateY(0px); }
`;

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const WhisperBubble = styled.div`
  background: #081008;
  border: 1px dashed #282;
  padding: calc(var(--space) * 2);
  position: relative;
  color: #8c8;
  ${type.body}
  font-style: italic;
  line-height: 1.4;
  width: 100%;
  animation: ${float} 4s ease-in-out infinite;

  p {
    margin: 0;
    animation: ${fadeIn} 0.5s ease-out;
  }
`;

const SidekickActions = styled.div`
    display: flex;
    gap: var(--space);
    margin-top: 0;
    flex-shrink: 0;
    padding-top: var(--space);
    border-top: none;
`;

const ActionButton = styled.button<{ $type: 'good' | 'bad' | 'neutral' }>`
    flex: 1;
    background: ${props => props.$type === 'good' ? '#003300' : props.$type === 'bad' ? '#330000' : 'var(--color-border-subtle)'};
    color: ${props => props.$type === 'good' ? '#6f6' : props.$type === 'bad' ? '#f66' : '#ccc'};
    border: 1px solid ${props => props.$type === 'good' ? 'var(--color-accent-green)' : props.$type === 'bad' ? 'var(--color-accent-red)' : 'var(--color-border-strong)'};
    padding: var(--space) var(--space);
    font-family: inherit;
    ${type.body}
    cursor: pointer;
    text-transform: uppercase;
    transition: all 0.2s;

    &:hover:not(:disabled) {
        background: ${props => props.$type === 'good' ? 'var(--color-accent-green)' : props.$type === 'bad' ? 'var(--color-accent-red)' : 'var(--color-border)'};
        color: var(--color-text-inverse);
    }
    
    &:disabled {
        opacity: 0.3;
        cursor: not-allowed;
        filter: grayscale(1);
    }
`;

// --- Component ---

interface PartnerPanelProps {
  activeCase: CaseData;
  suspect: Suspect;
  aggravationLevel: number;
  partnerEmotion: Emotion;
  sidekickComment: string | null;
  partnerCharges: number;
  isLocked: boolean;
  initialExamDone: boolean;
  mobileIntelOpen: boolean;
  onCloseMobileIntel?: () => void;
  onPartnerAction: (type: 'goodCop' | 'badCop' | 'examine' | 'hint') => void;
}

const PartnerPanel: React.FC<PartnerPanelProps> = ({
  activeCase,
  suspect,
  aggravationLevel,
  partnerEmotion,
  sidekickComment,
  partnerCharges,
  isLocked,
  initialExamDone,
  mobileIntelOpen,
  onCloseMobileIntel,
  onPartnerAction,
}) => {
  const partnerName = activeCase.partner?.name || "Junior Detective Al";

  // Mock a 'suspect' object from the partner support character data for SuspectPortrait
  const partnerAsSuspect: Suspect = {
    id: 'partner',
    name: activeCase.partner?.name || "Partner",
    role: activeCase.partner?.role || "Junior Detective",
    status: "Allied",
    avatarSeed: activeCase.partner?.avatarSeed || 999,
    portraits: activeCase.partner?.portraits || {},
    gender: activeCase.partner?.gender || "Unknown",
    age: 25,
    bio: "Your partner.",
    personality: activeCase.partner?.personality || "Helpful",
    baseAggravation: 0,
    isGuilty: false,
    secret: "",
    alibi: { statement: "", isTrue: true, location: "", witnesses: [] },
    motive: "",
    relationships: [],
    timeline: [],
    knownFacts: [],
    professionalBackground: "",
    witnessObservations: "",
    hiddenEvidence: []
  };

  return (
    <>
      <IntelOverlay $visible={mobileIntelOpen} onClick={() => onCloseMobileIntel?.()} />
      <RightPanel id="right-panel" $mobileOpen={mobileIntelOpen}>
        <AggravationMeter id="aggravation-meter">
          <h3>{suspect.isDeceased ? "Status" : "Aggravation"}</h3>
          {!suspect.isDeceased && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space)' }}>
              <span>{`${aggravationLevel}%`}</span>
            </div>
          )}
          {!suspect.isDeceased && <ProgressBar $level={aggravationLevel} />}
          {isLocked && <div style={{ color: 'red', marginTop: 'var(--space)', fontSize: 'var(--type-small)' }}>LAWYER REQUESTED</div>}
          {suspect.isDeceased && <DeceasedBadge>DECEASED</DeceasedBadge>}
        </AggravationMeter>

        <SidekickContainer id="partner-support">
          <h3>Partner Support</h3>
          <SidekickHeader>
            <div style={{ width: '120px', height: '120px', border: '2px solid #555', background: '#222' }}>
              <SuspectPortrait
                suspect={partnerAsSuspect}
                emotion={partnerEmotion}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <div className="info">
              <h3>{partnerName}</h3>
              <span>CHARGES: {partnerCharges}/{activeCase.partnerCharges ?? 3}</span>
            </div>
          </SidekickHeader>

          <BubbleScrollArea>
            <WhisperBubble>
              <p key={sidekickComment}>
                {sidekickComment ? `(Whispering) "${sidekickComment}"` : `(${partnerName} is watching carefully...)`}
              </p>
            </WhisperBubble>
          </BubbleScrollArea>

          <SidekickActions>
            {suspect.isDeceased ? (
              <>
                <ActionButton
                  $type="neutral"
                  onClick={() => { onPartnerAction('examine'); onCloseMobileIntel?.(); }}
                  disabled={partnerCharges <= 0 || initialExamDone}
                  title="Perform Initial Examination (Once)"
                >
                  {initialExamDone ? "Exam Done" : "Initial Exam"}
                </ActionButton>
              </>
            ) : (
              <>
                <ActionButton
                  $type="good"
                  onClick={() => { onPartnerAction('goodCop'); onCloseMobileIntel?.(); }}
                  disabled={partnerCharges <= 0 || isLocked}
                  title="Calm Suspect (-50% Aggravation)"
                >
                  Good Cop
                </ActionButton>
                <ActionButton
                  $type="bad"
                  onClick={() => { onPartnerAction('badCop'); onCloseMobileIntel?.(); }}
                  disabled={partnerCharges <= 0 || isLocked}
                  title="Force Evidence (+Aggravation)"
                >
                  Bad Cop
                </ActionButton>
              </>
            )}
          </SidekickActions>
        </SidekickContainer>

      </RightPanel>
    </>
  );
};

export default PartnerPanel;
