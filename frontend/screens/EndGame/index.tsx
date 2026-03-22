
import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { CaseData, CaseStats, Evidence } from '../../types';
import { generateCaseSummary } from '../../services/geminiService';

// Sub-components
import CaseReport from './CaseReport';
import StatsPanel from './StatsPanel';

// --- Styled Components ---

const Container = styled.div`
  display: flex;
  height: 100%;
  padding: calc(var(--space) * 8) calc(var(--space) * 10);
  gap: calc(var(--space) * 5);
  background: var(--color-surface-inset);
  @media (max-width: 768px) {
    display: block;
    height: 100%;
    overflow-y: auto;
    padding: calc(var(--space) * 2);
    gap: 0;
  }
`;

// --- Props ---

interface EndGameProps {
  gameResult: 'SUCCESS' | 'PARTIAL' | 'FAILURE' | null;
  caseData: CaseData;
  accusedIds: string[];
  evidenceDiscovered: Evidence[];
  onReset: () => void;
  caseStats: CaseStats | null;
  userVote: 'up' | 'down' | null;
  onVote: (vote: 'up' | 'down') => void;
  suspectsSpoken: number;
  timelineFound: number;
}

const EndGame: React.FC<EndGameProps> = ({
  gameResult, caseData, accusedIds, evidenceDiscovered, onReset,
  caseStats, userVote, onVote, suspectsSpoken, timelineFound
}) => {
  const [summary, setSummary] = useState("Generating case report...");

  useEffect(() => {
    generateCaseSummary(caseData, accusedIds[0], gameResult || 'FAILURE', evidenceDiscovered)
      .then(setSummary);
  }, [caseData, accusedIds, gameResult, evidenceDiscovered]);

  const accusedSuspects = caseData.suspects.filter(s => accusedIds.includes(s.id));
  const guiltySuspects = caseData.suspects.filter(s => s.isGuilty);
  const guiltyNames = guiltySuspects.map(s => s.name).join(', ');
  const accusedNames = accusedSuspects.map(s => s.name).join(', ');

  const totalHiddenEvidence = caseData.suspects.reduce((acc, s) => acc + (s.hiddenEvidence?.length || 0), 0);
  const allHiddenTitles = new Set(caseData.suspects.flatMap(s => (s.hiddenEvidence || []).map(e => e.title)));
  const foundHiddenCount = evidenceDiscovered.filter(e => allHiddenTitles.has(e.title)).length;
  const totalSuspects = caseData.suspects.filter(s => !s.isDeceased).length;
  const totalTimeline = caseData.suspects.reduce((acc, s) => acc + (s.timeline?.length || 0), 0);

  const resultColor = gameResult === 'SUCCESS' ? 'var(--color-accent-green)' :
    gameResult === 'PARTIAL' ? 'var(--color-accent-orange)' : 'var(--color-accent-red)';

  return (
    <Container>
      <CaseReport
        gameResult={gameResult}
        resultColor={resultColor}
        accusedNames={accusedNames}
        guiltyNames={guiltyNames}
        summary={summary}
        onReset={onReset}
      />
      <StatsPanel
        gameResult={gameResult}
        resultColor={resultColor}
        caseData={caseData}
        accusedSuspects={accusedSuspects}
        evidenceDiscovered={evidenceDiscovered}
        caseStats={caseStats}
        userVote={userVote}
        onVote={onVote}
        onReset={onReset}
        foundHiddenCount={foundHiddenCount}
        totalHiddenEvidence={totalHiddenEvidence}
        totalSuspects={totalSuspects}
        totalTimeline={totalTimeline}
        suspectsSpoken={suspectsSpoken}
        timelineFound={timelineFound}
      />
    </Container>
  );
};

export default EndGame;
