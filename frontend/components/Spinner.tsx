import styled, { keyframes } from 'styled-components';

const rotate = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

/**
 * Reusable spinning loader.
 * Uses a CSS border-top trick — drop it into any loading overlay.
 *
 * Props (via styled-component attrs / inline style):
 *   --spinner-size   (default 50px)
 *   --spinner-color  (default var(--color-accent-green))
 */
const Spinner = styled.div<{ $size?: number; $color?: string }>`
  width: ${props => props.$size ?? 50}px;
  height: ${props => props.$size ?? 50}px;
  border: 4px solid var(--color-border);
  border-top-color: ${props => props.$color ?? 'var(--color-accent-green)'};
  border-radius: 50%;
  animation: ${rotate} 1s linear infinite;
  flex-shrink: 0;
`;

export default Spinner;
