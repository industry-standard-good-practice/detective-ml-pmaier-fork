/**
 * Dropdown — Reusable custom styled dropdown.
 *
 * Replaces native <select> with a fully styled trigger + popover menu.
 * Features: click-outside-to-close, active indicator dot, keyboard-friendly,
 * consistent dark theme styling.
 *
 * Used for TTS voice selectors, hero image pickers, evidence ownership, etc.
 */

import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { type } from '../../theme';

// --- Styled Primitives ---

const Wrapper = styled.div<{ $flex?: boolean }>`
  position: relative;
  ${props => props.$flex ? 'flex: 1; min-width: 0;' : 'width: 100%;'}
`;

const Trigger = styled.button`
  ${type.body}
  background: var(--color-surface-raised);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  padding: var(--space);
  padding-right: calc(var(--space) * 3);
  cursor: pointer;
  text-align: left;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  position: relative;
  text-transform: none;
  font-family: inherit;
  box-sizing: border-box;

  &::after {
    content: '▼';
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    ${type.xs}
    color: var(--color-text-dim);
    pointer-events: none;
  }

  &:hover {
    border-color: var(--color-text-subtle);
  }
`;

const Menu = styled.div`
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border-strong);
  min-width: 200px;
  max-height: 250px;
  overflow-y: auto;
  z-index: 50;
  box-shadow: 0 -4px 20px rgba(0,0,0,0.6);

  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-thumb { background: var(--color-border); }
`;

const Option = styled.button<{ $active?: boolean }>`
  ${type.body}
  background: ${props => props.$active ? 'var(--color-accent-green-dark)' : 'transparent'};
  color: ${props => props.$active ? 'var(--color-accent-green)' : 'var(--color-text-muted)'};
  border: none;
  border-bottom: 1px solid var(--color-border-subtle);
  padding: var(--space) calc(var(--space) * 2);
  text-align: left;
  cursor: pointer;
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space);
  text-transform: none;
  font-family: inherit;

  &:last-child { border-bottom: none; }

  &:hover {
    background: var(--color-border-subtle);
    color: var(--color-text-bright);
  }
`;

const ActiveDot = styled.span`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-accent-green);
  flex-shrink: 0;
`;

// --- Types ---

export interface DropdownOption {
  value: string;
  label: string;
}

export interface DropdownProps {
  /** Array of selectable options */
  options: DropdownOption[];
  /** Currently selected value */
  value: string;
  /** Callback when an option is selected */
  onChange: (value: string) => void;
  /** Placeholder text when no option matches the current value */
  placeholder?: string;
  /** Optional title attribute on the trigger button */
  title?: string;
  /** If true, uses flex: 1 instead of width: 100% on the wrapper */
  flex?: boolean;
}

// --- Component ---

const Dropdown: React.FC<DropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  title,
  flex,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const currentOption = options.find(o => o.value === value);
  const label = currentOption ? currentOption.label : placeholder;

  return (
    <Wrapper ref={ref} $flex={flex}>
      <Trigger onClick={() => setOpen(!open)} title={title}>
        {label}
      </Trigger>
      {open && (
        <Menu>
          {options.map(o => (
            <Option
              key={o.value}
              $active={value === o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {value === o.value && <ActiveDot />}
              {o.label}
            </Option>
          ))}
        </Menu>
      )}
    </Wrapper>
  );
};

export default Dropdown;
