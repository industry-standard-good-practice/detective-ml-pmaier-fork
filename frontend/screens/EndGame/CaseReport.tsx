
import React from 'react';
import { type } from '../../theme';
import styled, { keyframes } from 'styled-components';

// --- Styled Components ---

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

const LeftPanel = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  animation: ${fadeIn} 0.5s ease-out;
  height: 100%;
  min-height: 0;
  @media (max-width: 768px) {
    height: auto;
    display: block;
    margin-bottom: calc(var(--space) * 4);
  }
`;

const TopRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: calc(var(--space) * 3);
  padding-bottom: calc(var(--space) * 3);
  border-bottom: 2px solid var(--color-border);
  @media (max-width: 768px) {
    flex-direction: column;
    align-items: stretch;
    gap: calc(var(--space) * 2);
    text-align: center;
  }
`;

const Header = styled.h1<{ $gameResult: 'SUCCESS' | 'PARTIAL' | 'FAILURE' | null }>`
  ${type.h1}
  color: ${props => props.$gameResult === 'SUCCESS' ? 'var(--color-accent-green)' : props.$gameResult === 'PARTIAL' ? 'var(--color-accent-orange)' : 'var(--color-accent-red)'};
  margin: 0;
  text-transform: uppercase;
  text-shadow: 0 0 10px ${props => props.$gameResult === 'SUCCESS' ? 'var(--color-accent-green)' : props.$gameResult === 'PARTIAL' ? 'var(--color-accent-orange)' : 'var(--color-accent-red)'};
  line-height: 1;
  @media (max-width: 768px) { ${type.h2} }
`;

const CompactStats = styled.div`
  display: flex;
  gap: calc(var(--space) * 4);
  @media (max-width: 768px) {
    width: 100%;
    justify-content: center;
    gap: calc(var(--space) * 3);
  }
`;

const CompactStatItem = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  @media (max-width: 768px) { align-items: center; }
  label { ${type.small} color: #777; text-transform: uppercase; margin-bottom: var(--space); }
  span { ${type.h3} color: var(--color-text-bright); font-weight: bold; text-shadow: 0 0 5px rgba(255,255,255,0.2); }
`;

const ReportWrapper = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  @media (max-width: 768px) {
    display: block;
    height: auto;
    min-height: 0;
  }
`;

const SummaryBox = styled.div`
  background: var(--color-surface-raised);
  padding: calc(var(--space) * 4);
  border-left: 4px solid var(--color-border-strong);
  color: var(--color-text);
  ${type.bodyLg}
  line-height: 1.6;
  white-space: pre-wrap;
  font-family: 'VT323', monospace;
  overflow-y: auto;
  flex: 1;
  @media (max-width: 768px) {
    padding: calc(var(--space) * 2);
    ${type.body}
    height: auto;
    overflow-y: visible;
    border-left: 2px solid var(--color-border-strong);
  }
`;

const ResetButton = styled.button`
  background: var(--color-text-bright);
  color: var(--color-text-inverse);
  border: none;
  padding: calc(var(--space) * 2) calc(var(--space) * 4);
  ${type.h3}
  font-family: inherit;
  font-weight: bold;
  cursor: pointer;
  text-transform: uppercase;
  margin-top: calc(var(--space) * 3);
  &:hover { background: #ccc; }
  @media (max-width: 768px) {
    width: 100%;
    padding: calc(var(--space) * 3);
    margin-bottom: calc(var(--space) * 3);
  }
`;

const ReportLine = styled.div`
  min-height: 1.2em;
  margin-bottom: var(--space);
`;

const FoundTag = styled.span`
  color: var(--color-accent-green);
  font-weight: bold;
`;

const MissedTag = styled.span`
  color: var(--color-accent-red-bright);
  font-weight: bold;
`;

const BoldTag = styled.span`
  color: var(--color-text-bright);
  font-weight: bold;
`;

const DesktopOnly = styled.div`
  @media (max-width: 768px) { display: none; }
`;

const ColoredValue = styled.span<{ $color: string }>`
  color: ${props => props.$color};
`;

// --- Props ---

interface CaseReportProps {
  gameResult: 'SUCCESS' | 'PARTIAL' | 'FAILURE' | null;
  resultColor: string;
  accusedNames: string;
  guiltyNames: string;
  summary: string;
  onReset: () => void;
}

const CaseReport: React.FC<CaseReportProps> = ({
  gameResult,
  resultColor,
  accusedNames,
  guiltyNames,
  summary,
  onReset,
}) => {
  const formatReport = (text: string) => {
    if (!text) return null;
    return text.split('\n').map((line, i) => {
      const parts = line.split(/(\\{\\{FOUND:.*?\\}\\}|\\{\\{MISSED:.*?\\}\\}|\*\*.*?\*\*)/g);
      return (
        <ReportLine key={i}>
          {parts.map((part, j) => {
            if (part.startsWith('{{FOUND:')) {
              const content = part.slice(8, -2);
              return <FoundTag key={j}>{content}</FoundTag>;
            }
            if (part.startsWith('{{MISSED:')) {
              const content = part.slice(9, -2);
              return <MissedTag key={j}>{content}</MissedTag>;
            }
            if (part.startsWith('**') && part.endsWith('**')) {
              return <BoldTag key={j}>{part.slice(2, -2)}</BoldTag>;
            }
            return <span key={j}>{part}</span>;
          })}
        </ReportLine>
      );
    });
  };

  return (
    <LeftPanel>
      <TopRow>
        <Header $gameResult={gameResult}>
          {gameResult === 'SUCCESS' ? "CASE CLOSED" : gameResult === 'PARTIAL' ? "PARTIAL SUCCESS" : "CASE FAILED"}
        </Header>
        <CompactStats>
          <CompactStatItem>
            <label>Accused Suspect(s)</label>
            <ColoredValue $color={resultColor}>{accusedNames || "None"}</ColoredValue>
          </CompactStatItem>
          <CompactStatItem>
            <label>True Perpetrator(s)</label>
            <span>{guiltyNames}</span>
          </CompactStatItem>
        </CompactStats>
      </TopRow>

      <ReportWrapper>
        <SummaryBox>
          {formatReport(summary)}
        </SummaryBox>
      </ReportWrapper>

      <DesktopOnly>
        <ResetButton onClick={onReset}>RETURN TO HQ</ResetButton>
      </DesktopOnly>
    </LeftPanel>
  );
};

export default CaseReport;
