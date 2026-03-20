
import React from 'react';
import styled from 'styled-components';
import { type } from '../../../theme';

// --- Styled Components ---

const TypeButtonWrapper = styled.div`
  position: relative;
  height: 100%;
`;

const TypeButton = styled.button<{ $disabled: boolean }>`
  background-color: transparent;
  color: var(--color-text-subtle);
  border: none;
  border-right: 1px solid var(--color-border);
  height: 100%;
  padding: 0 35px 0 15px;
  font-family: 'VT323', monospace;
  ${type.body}
  cursor: pointer;
  text-transform: uppercase;
  position: relative;
  white-space: nowrap;
  transition: all 0.2s;

  &::after {
    content: '';
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 5px solid var(--color-text-subtle);
  }

  &:hover {
    color: var(--color-text-bright);
    background: var(--color-surface-raised);
    &::after { border-top-color: var(--color-text-bright); }
  }

  ${props => props.$disabled && `
    cursor: not-allowed;
    opacity: 0.5;
    &:hover { color: var(--color-text-subtle); background: transparent; &::after { border-top-color: var(--color-text-subtle); } }
  `}

  @media (max-width: 768px) {
    padding: 0 25px 0 8px;
    ${type.body}
    background: var(--color-border-subtle);
    border: none;
    border-right: none;
    &::after { right: 5px; }
  }
`;

const TypeMenu = styled.div`
  position: absolute;
  bottom: 110%;
  left: 0;
  background: #050505;
  border: 1px solid #555;
  width: 140px;
  z-index: 50;
  box-shadow: 0 0 20px var(--color-bg);
  display: flex;
  flex-direction: column;
`;

const TypeMenuItem = styled.button<{ $active: boolean }>`
  background: ${props => props.$active ? 'var(--color-border-subtle)' : 'transparent'};
  color: ${props => props.$active ? 'var(--color-text-bright)' : '#ccc'};
  border: none;
  padding: var(--space) calc(var(--space) * 2);
  text-align: left;
  font-family: inherit;
  ${type.body}
  cursor: pointer;
  border-bottom: 1px solid var(--color-border-subtle);
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: var(--space);
  transition: background 0.15s;

  &:last-child { border-bottom: none; }

  &:hover {
    background: var(--color-border-subtle);
    color: var(--color-text-bright);
  }
`;

// --- Component ---

interface TypePickerProps {
  inputType: 'talk' | 'action';
  showTypePicker: boolean;
  isLocked: boolean;
  isDeceased: boolean;
  onToggle: () => void;
  onSelect: (type: 'talk' | 'action') => void;
  menuRef: React.RefObject<HTMLDivElement>;
}

const TypePicker: React.FC<TypePickerProps> = ({
  inputType,
  showTypePicker,
  isLocked,
  isDeceased,
  onToggle,
  onSelect,
  menuRef,
}) => (
  <TypeButtonWrapper ref={menuRef}>
    <TypeButton
      onClick={() => !isLocked && !isDeceased && onToggle()}
      $disabled={isLocked || isDeceased}
    >
      {inputType === 'talk' ? '💬 Talk' : '🫴 Action'}
    </TypeButton>
    {showTypePicker && (
      <TypeMenu>
        <TypeMenuItem $active={inputType === 'talk'} onClick={() => onSelect('talk')}>
          {inputType === 'talk' && <span>✓</span>}💬 Talk
        </TypeMenuItem>
        <TypeMenuItem $active={inputType === 'action'} onClick={() => onSelect('action')}>
          {inputType === 'action' && <span>✓</span>}🫴 Action
        </TypeMenuItem>
      </TypeMenu>
    )}
  </TypeButtonWrapper>
);

export default TypePicker;
