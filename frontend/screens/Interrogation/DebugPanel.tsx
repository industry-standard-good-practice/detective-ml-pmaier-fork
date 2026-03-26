
import React, { useState } from 'react';
import styled from 'styled-components';
import { type } from '../../theme';
import { Suspect, Evidence } from '../../types';

// --- Styled Components ---

const DebugToggle = styled.button`
  position: absolute;
  top: 10px;
  right: 10px;
  background: #300;
  color: var(--color-accent-red-bright);
  border: 1px solid var(--color-accent-red);
  font-family: 'VT323', monospace;
  ${type.small}
  cursor: pointer;
  z-index: 50;
  opacity: 0.5;
  &:hover { opacity: 1; }
  
  @media (max-width: 768px) {
    display: none;
  }
`;

const DebugMenu = styled.div`
  position: absolute;
  top: 40px;
  right: 10px;
  background: rgba(0,0,0,0.9);
  border: 1px solid #f00;
  padding: var(--space);
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: var(--space);
  max-width: 300px;
`;

const DebugItem = styled.button`
  background: #200;
  color: #f88;
  border: none;
  text-align: left;
  padding: var(--space);
  cursor: pointer;
  font-family: 'VT323';
  ${type.small}
  &:hover { background: #400; }
`;

// --- Component ---

interface DebugPanelProps {
  suspect: Suspect;
  canDebug: boolean;
  onForceEvidence: (suspectId: string, evidenceTitle: string) => void;
}

const DebugPanel: React.FC<DebugPanelProps> = ({
  suspect,
  canDebug,
  onForceEvidence,
}) => {
  const [debugMode, setDebugMode] = useState(false);

  if (!canDebug) return null;

  return (
    <>
      <DebugToggle onClick={() => setDebugMode(!debugMode)}>DEBUG</DebugToggle>
      {debugMode && (
        <DebugMenu>
          <div style={{ color: '#f00', borderBottom: '1px solid #500', marginBottom: 'var(--space)' }}>FORCE EVIDENCE</div>
          {suspect.hiddenEvidence.map((ev) => (
            <DebugItem key={ev.id} onClick={() => {
              onForceEvidence(suspect.id, ev.title);
              setDebugMode(false);
            }}>
              {ev.title}
            </DebugItem>
          ))}
        </DebugMenu>
      )}
    </>
  );
};

export default DebugPanel;
