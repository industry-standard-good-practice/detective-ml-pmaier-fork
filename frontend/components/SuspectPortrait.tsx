import React, { useState, useEffect } from 'react';
import { type } from '../theme';
import styled, { keyframes } from 'styled-components';
import { Suspect, Emotion } from '../types';
import { getSuspectPortrait } from '../services/geminiService';

export type ImageLoadingState = 'waiting' | 'generating' | null;

const Container = styled.div<{ $size?: number }>`
  width: ${props => props.$size ? `${props.$size}px` : '100%'};
  height: ${props => props.$size ? `${props.$size}px` : '100%'};
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
  background-color: var(--color-bg);
`;

const Img = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  image-rendering: pixelated;
`;

const NoImagePlaceholder = styled.div`
  width: 100%;
  height: 100%;
  background: #2a2a2a;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #555;
  font-family: 'VT323', monospace;
  font-size: 2.5rem;
  user-select: none;
`;

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
`;

const LoadingOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: rgba(0, 0, 0, 0.6);
  z-index: 2;
  pointer-events: none;
`;

const SpinnerRing = styled.div`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 3px solid var(--color-accent-green);
  border-top-color: transparent;
  animation: ${spin} 0.8s linear infinite;
  box-shadow: 0 0 8px rgba(0, 255, 0, 0.3);
`;

const WaitDots = styled.div`
  display: flex;
  gap: 4px;
  & > span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-text-dim);
    animation: ${pulse} 1.2s ease-in-out infinite;
  }
  & > span:nth-child(2) { animation-delay: 0.2s; }
  & > span:nth-child(3) { animation-delay: 0.4s; }
`;

const LoadingLabel = styled.span`
  ${type.xs}
  color: var(--color-text-dim);
  text-transform: uppercase;
  letter-spacing: 1px;
`;

interface SuspectPortraitProps {
  suspect: Suspect;
  /** Living: Emotion enum. Deceased: examination key (HEAD, ENVSCENE_…, ENVIRONMENT, …). */
  emotion?: Emotion | string;
  aggravation?: number;
  size?: number;
  turnId?: string;
  style?: React.CSSProperties;
  className?: string;
  /** Optional loading state indicator overlaid on the portrait */
  imageLoadingState?: ImageLoadingState;
  /** When true, hide text labels and only show spinner/dots (auto-set when size <= 60) */
  compact?: boolean;
}

const SuspectPortrait: React.FC<SuspectPortraitProps> = ({ 
  suspect, 
  emotion = Emotion.NEUTRAL, 
  aggravation = 0, 
  size,
  turnId,
  style, 
  className,
  imageLoadingState = null,
  compact: compactProp
}) => {
  // Auto-compact when rendered at small sizes
  const isCompact = compactProp ?? (size != null && size <= 60);
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    
    const load = async () => {
      try {
        const url = await getSuspectPortrait(suspect, emotion, aggravation, turnId);
        if (mounted) {
          setImgSrc(url);
        }
      } catch (e) {
        console.error("Portrait load error", e);
      }
    };

    load();

    return () => { mounted = false; };
  }, [suspect, emotion, aggravation, turnId, suspect.avatarSeed, suspect.portraits]);

  return (
    <Container $size={size} style={style} className={className}>
      {imgSrc ? (
        <Img src={imgSrc} alt={suspect.name} />
      ) : (
        <NoImagePlaceholder>?</NoImagePlaceholder>
      )}
      {imageLoadingState && (
        <LoadingOverlay>
          {imageLoadingState === 'generating' ? (
            <>
              <SpinnerRing />
              {!isCompact && <LoadingLabel>GENERATING</LoadingLabel>}
            </>
          ) : (
            <>
              <WaitDots>
                <span /><span /><span />
              </WaitDots>
              {!isCompact && <LoadingLabel>QUEUED</LoadingLabel>}
            </>
          )}
        </LoadingOverlay>
      )}
    </Container>
  );
};

export default SuspectPortrait;