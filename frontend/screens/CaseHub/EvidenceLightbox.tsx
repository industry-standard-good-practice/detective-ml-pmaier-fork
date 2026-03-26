
import React from 'react';
import { type } from '../../theme';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { Evidence } from '../../types';

// --- Styled Components ---

const LightboxOverlay = styled(motion.div)`
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 10000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  cursor: pointer;
  overflow-y: auto;
  padding: calc(var(--space) * 5) calc(var(--space) * 3);
`;

const LightboxCardWrapper = styled(motion.div)`
  background: var(--color-polaroid-bg);
  color: var(--color-text-inverse);
  padding: calc(var(--space) * 3) calc(var(--space) * 3) calc(var(--space) * 5) calc(var(--space) * 3);
  max-width: 500px;
  width: 90vw;
  box-shadow: 0 20px 60px rgba(0,0,0,0.8);
  font-family: 'Caveat', cursive;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: default;
  margin: auto 0;
  flex-shrink: 0;
`;

const LightboxImage = styled.div<{ $src?: string }>`
  width: 100%;
  aspect-ratio: 1;
  background-color: var(--color-border);
  background-image: ${props => props.$src ? `url(${props.$src})` : 'none'};
  background-size: cover;
  background-position: center;
  image-rendering: pixelated;
  border: 1px solid #ddd;
  margin-bottom: calc(var(--space) * 2);
`;

const LightboxText = styled.div`
  text-align: center;
  width: 100%;
  strong {
    display: block;
    font-size: var(--type-h2);
    margin-bottom: var(--space);
    font-weight: 700;
  }
  span {
    font-size: var(--type-h3);
    color: var(--color-border);
    display: block;
    padding: 0 10px;
    line-height: 1.4;
  }
`;

const LightboxClose = styled.button`
  position: fixed;
  top: 20px;
  right: 30px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border: 2px solid #fff;
  ${type.bodyLg}
  font-family: 'VT323', monospace;
  padding: var(--space) calc(var(--space) * 2);
  cursor: pointer;
  z-index: 10002;
  transition: background 0.2s;
  &:hover { background: rgba(255,255,255,0.2); }
`;

// --- Props ---

interface EvidenceLightboxProps {
  selectedEvidenceId: string | null;
  evidence: { title: string; description: string; imageUrl?: string; id?: string } | null;
  onClose: () => void;
}

const EvidenceLightbox: React.FC<EvidenceLightboxProps> = ({
  selectedEvidenceId,
  evidence,
  onClose,
}) => {
  return (
    <AnimatePresence>
      {selectedEvidenceId && evidence && (
        <LightboxOverlay
          key="lightbox-overlay"
          initial={{ backgroundColor: 'rgba(0, 0, 0, 0)' }}
          animate={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
          exit={{ backgroundColor: 'rgba(0, 0, 0, 0)' }}
          transition={{ duration: 0.25 }}
          onClick={onClose}
        >
          <LightboxClose onClick={onClose}>CLOSE</LightboxClose>
          <LightboxCardWrapper
            layoutId={selectedEvidenceId}
            onClick={e => e.stopPropagation()}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <LightboxImage $src={evidence.imageUrl} />
            <LightboxText>
              <strong>{evidence.title}</strong>
              <span>{evidence.description}</span>
            </LightboxText>
          </LightboxCardWrapper>
        </LightboxOverlay>
      )}
    </AnimatePresence>
  );
};

export default EvidenceLightbox;
