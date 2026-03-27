import React from 'react';
import styled from 'styled-components';
import { type } from '../theme';

const Container = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #000;
  color: #33ff33;
  font-family: 'VT323', monospace;
  ${type.h3}
  padding: calc(var(--screen-edge-top, 50px) + 20px) calc(var(--screen-edge-horizontal, 80px) + 20px)
    calc(var(--screen-edge-bottom, 30px) + 20px) calc(var(--screen-edge-horizontal, 80px) + 20px);
  z-index: 100;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(var(--space) * 2);
  user-select: none;
  -webkit-user-select: none;

  @media (max-width: 768px) {
    ${type.small}
  }
`;

const StandbyLine = styled.p`
  margin: 0;
  text-shadow: 0 0 5px #33ff33;
  text-align: center;
`;

const BootButton = styled.button`
  font-family: inherit;
  font-size: inherit;
  color: #33ff33;
  background: #0a1a0a;
  border: 2px solid #33ff33;
  padding: calc(var(--space) * 1.25) calc(var(--space) * 2.5);
  cursor: pointer;
  text-shadow: 0 0 5px #33ff33;
  box-shadow: 0 0 12px rgba(51, 255, 51, 0.25);

  &:hover {
    background: #0f2a0f;
  }

  &:focus-visible {
    outline: 2px solid #33ff33;
    outline-offset: 4px;
  }
`;

interface BootUpGateProps {
  onBootUp: () => void;
}

/** Shown before BootSequence; parent runs CRT turn-on, SFX gesture, and BIOS boot on click. */
const BootUpGate: React.FC<BootUpGateProps> = ({ onBootUp }) => {
  return (
    <Container>
      <StandbyLine>SYSTEM STANDBY — POWER OK</StandbyLine>
      <BootButton type="button" onClick={onBootUp} data-cursor="pointer">
        BOOT SYSTEM
      </BootButton>
    </Container>
  );
};

export default BootUpGate;
