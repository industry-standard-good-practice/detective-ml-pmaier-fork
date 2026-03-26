/**
 * Checkbox — Themed boolean control (no native chrome).
 * Uses a visually hidden native input for accessibility and form behavior.
 */

import React from 'react';
import styled, { css } from 'styled-components';
import { type } from '../../theme';

const Root = styled.label<{ $disabled?: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  gap: calc(var(--space) * 0.75);
  ${type.small}
  color: var(--color-text-muted);
  cursor: ${(p) => (p.$disabled ? 'not-allowed' : 'pointer')};
  user-select: none;
`;

const HiddenInput = styled.input.attrs({ type: 'checkbox' })`
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
`;

const Box = styled.span<{ $checked: boolean; $disabled?: boolean }>`
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  box-sizing: border-box;
  border: 1px solid var(--color-border-strong);
  background: ${(p) =>
    p.$checked ? 'var(--color-accent-green-dark)' : 'var(--color-surface-inset)'};
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s ease, border-color 0.12s ease;

  ${(p) =>
    !p.$disabled &&
    css`
      ${Root}:hover & {
        border-color: var(--color-text-subtle);
      }
    `}

  ${Root}:focus-within & {
    outline: 2px solid var(--color-accent-green);
    outline-offset: 2px;
  }
`;

const Mark = styled.span`
  ${type.xs}
  color: var(--color-accent-green);
  font-weight: bold;
  line-height: 1;
  transform: translateY(-0.5px);
`;

const LabelText = styled.span`
  flex: 1;
  min-width: 0;
`;

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
  title?: string;
}

const Checkbox: React.FC<CheckboxProps> = ({
  checked,
  onChange,
  children,
  disabled,
  id,
  className,
  title,
}) => (
  <Root $disabled={disabled} className={className} title={title}>
    <HiddenInput
      id={id}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
    <Box $checked={checked} $disabled={disabled} aria-hidden>
      {checked ? <Mark>✓</Mark> : null}
    </Box>
    <LabelText>{children}</LabelText>
  </Root>
);

export default Checkbox;
