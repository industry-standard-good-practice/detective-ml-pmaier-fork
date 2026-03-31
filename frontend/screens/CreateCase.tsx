
import React, { useState } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { type } from '../theme';
import { CasePollingState } from '../hooks/useCasePolling';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: calc(var(--space) * 5);
  gap: calc(var(--space) * 4);
`;

const Title = styled.h2`
  ${type.h2}
  color: var(--color-text-bright);
  margin: 0;
  text-shadow: 0 0 10px var(--color-text-bright);
  text-align: center;
`;

const PromptInput = styled.textarea`
  ${type.h3}
  width: 100%;
  max-width: 600px;
  height: 150px;
  background: var(--color-surface-inset);
  border: 2px solid var(--color-border);
  color: var(--color-accent-green);
  padding: calc(var(--space) * 3);
  resize: none;
  box-shadow: inset 0 0 20px rgba(0,0,0,0.8);
  text-transform: none;

  &:focus {
    outline: none;
    border-color: var(--color-accent-green);
    box-shadow: inset 0 0 20px var(--color-accent-green-dark), 0 0 10px var(--color-accent-green);
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: calc(var(--space) * 3);

  @media (max-width: 768px) {
    flex-direction: column;
    width: 100%;
    gap: var(--space);
  }
`;

const ActionButton = styled.button<{ $primary?: boolean }>`
  ${type.h3}
  background: ${props => props.$primary ? 'var(--color-accent-green)' : 'var(--color-border-subtle)'};
  color: ${props => props.$primary ? 'var(--color-text-inverse)' : 'var(--color-text)'};
  border: ${props => props.$primary ? 'none' : '1px solid var(--color-border-strong)'};
  padding: calc(var(--space) * 2) calc(var(--space) * 4);
  cursor: pointer;
  font-weight: bold;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    transform: scale(1.05);
    background: ${props => props.$primary ? '#3f3' : 'var(--color-border-strong)'};
    color: ${props => props.$primary ? 'var(--color-text-inverse)' : 'var(--color-text-bright)'};
    box-shadow: 0 0 15px ${props => props.$primary ? 'var(--color-accent-green)' : 'rgba(255,255,255,0.2)'};
  }

  &:disabled {
    opacity: 0.5;
    cursor: wait;
    filter: grayscale(1);
  }
`;

const blink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
`;

const LoadingText = styled.div`
  ${type.h3}
  color: var(--color-accent-green);
  margin-top: calc(var(--space) * 3);
  text-align: center;
  padding: 0 calc(var(--space) * 2);
  
  &::after {
    content: '_';
    animation: ${blink} 0.5s infinite;
  }
`;

const ProgressBar = styled.div`
  width: 400px;
  max-width: calc(100vw - calc(var(--space) * 4));
  height: 10px;
  background: var(--color-border-subtle);
  border: 1px solid var(--color-border-strong);
  margin-top: calc(var(--space) * 1.25);
  position: relative;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    top: 0; left: 0; bottom: 0;
    width: 30%;
    background: var(--color-accent-green);
    animation: slide 1.5s infinite ease-in-out;
  }

  @keyframes slide {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(400%); }
  }
`;

const DescriptionText = styled.p`
  ${type.bodyLg}
  color: var(--color-text-subtle);
  max-width: 600px;
  text-align: center;

  @media (max-width: 768px) {
    ${type.small}
  }
`;

const SmallCancelButton = styled(ActionButton)`
  ${type.body}
  margin-top: calc(var(--space) * 1.25);
  padding: var(--space) calc(var(--space) * 2.5);
`;

const LoadingWrapper = styled.div`
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const NoteText = styled.p`
  ${type.small}
  color: var(--color-text-dim);
  margin-top: calc(var(--space) * 2.5);
  font-style: italic;
  max-width: 400px;
`;

// --- Progressive generation checklist ---

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
`;

const ChecklistWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: calc(var(--space) * 1.25);
  margin-top: calc(var(--space) * 2.5);
  width: 100%;
  max-width: 360px;
`;

const CheckItem = styled.div<{ $done: boolean; $active: boolean }>`
  ${type.body}
  display: flex;
  align-items: center;
  gap: calc(var(--space) * 1.5);
  color: ${p => p.$done ? 'var(--color-accent-green)' : p.$active ? 'var(--color-text-bright)' : 'var(--color-text-dim)'};
  transition: color 0.3s;
  animation: ${p => p.$done ? css`${fadeIn} 0.3s ease-out` : 'none'};
`;

const CheckIcon = styled.span<{ $done: boolean; $active: boolean }>`
  display: inline-flex;
  width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  font-size: 12px;
  border: 1px solid ${p => p.$done ? 'var(--color-accent-green)' : 'var(--color-border-strong)'};
  background: ${p => p.$done ? 'var(--color-accent-green-dark, rgba(0,255,0,0.15))' : 'transparent'};
  flex-shrink: 0;

  ${p => p.$active && !p.$done && css`
    border-color: var(--color-accent-green);
    &::after {
      content: '…';
      animation: ${blink} 1s infinite;
    }
  `}
`;

const ErrorBox = styled.div`
  ${type.body}
  color: #ff6b6b;
  background: rgba(255, 80, 80, 0.1);
  border: 1px solid rgba(255, 80, 80, 0.3);
  padding: calc(var(--space) * 2) calc(var(--space) * 3);
  max-width: 400px;
  text-align: center;
  margin-top: calc(var(--space) * 2);
`;

interface CreateCaseProps {
  onGenerate: (prompt: string, isLucky: boolean) => void;
  onCancel: () => void;
  isLoading: boolean;
  loadingStatus?: string;
  /** If set, we're in async polling mode — show progressive checklist */
  pollingState?: CasePollingState | null;
}

const CreateCase: React.FC<CreateCaseProps> = ({ onGenerate, onCancel, isLoading, loadingStatus, pollingState }) => {
  const [prompt, setPrompt] = useState('');

  // Determine which loading mode we're in
  const isAsyncGenerating = !!(pollingState && pollingState.isPolling);
  const isAsyncComplete = !!(pollingState && pollingState.isComplete);
  const isAsyncFailed = !!(pollingState && pollingState.isFailed);
  const showLoading = isLoading || isAsyncGenerating;

  // Derive status text — just two meaningful states
  let activeStatus = loadingStatus || '';
  if (isAsyncGenerating && pollingState) {
    const { progress } = pollingState;
    if (!progress.isClaimed) {
      activeStatus = 'Waiting for service to begin processing your request...';
    } else {
      activeStatus = 'Designing case details...';
    }
  } else if (!activeStatus && showLoading) {
    activeStatus = 'Submitting case generation request...';
  }

  return (
    <Container>
      <Title>New Investigation</Title>

      {!showLoading && !isAsyncFailed ? (
        <>
          <DescriptionText>
            Describe the crime you want to solve. Be as specific or as vague as you like.
            <br /><br />
            <i>"A murder at a jazz club in 1920s New York."</i>
            <br />
            <i>"Theft of a cybernetic arm on Mars."</i>
          </DescriptionText>

          <PromptInput
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Type your case concept here..."
            autoFocus
          />

          <ButtonGroup>
            <ActionButton onClick={() => onGenerate('', true)} disabled={isLoading}>
              I'm Feeling Lucky
            </ActionButton>
            <ActionButton $primary onClick={() => onGenerate(prompt, false)} disabled={!prompt.trim() || isLoading}>
              Generate & Review
            </ActionButton>
          </ButtonGroup>

          <SmallCancelButton onClick={onCancel}>
            Cancel
          </SmallCancelButton>
        </>
      ) : isAsyncFailed ? (
        <LoadingWrapper>
          <ErrorBox>
            ⚠ Case generation failed: {pollingState?.error || 'Unknown error'}
          </ErrorBox>
          <SmallCancelButton onClick={onCancel} style={{ marginTop: 'calc(var(--space) * 3)' }}>
            Go Back
          </SmallCancelButton>
        </LoadingWrapper>
      ) : (
        <LoadingWrapper>
          <LoadingText>
            {activeStatus}
          </LoadingText>

          <ProgressBar />

          {/* Two-step checklist */}
          {pollingState && (() => {
            const p = pollingState.progress;
            return (
            <ChecklistWrapper>
              <CheckItem $done={p.isClaimed} $active={!p.isClaimed}>
                <CheckIcon $done={p.isClaimed} $active={!p.isClaimed}>
                  {p.isClaimed ? '✓' : ''}
                </CheckIcon>
                Queued for processing
              </CheckItem>

              <CheckItem $done={p.hasTitle} $active={p.isClaimed && !p.hasTitle}>
                <CheckIcon $done={p.hasTitle} $active={p.isClaimed && !p.hasTitle}>
                  {p.hasTitle ? '✓' : ''}
                </CheckIcon>
                Designing case details
                {p.generationStep === 'ai-thinking' && (
                  <span style={{ opacity: 0.6, fontSize: '0.85em' }}> — this takes about a minute</span>
                )}
                {p.hasTitle && pollingState.caseData?.title && (
                  <span style={{ opacity: 0.6, fontSize: '0.85em' }}> — "{pollingState.caseData.title}"</span>
                )}
              </CheckItem>
            </ChecklistWrapper>
            );
          })()}

          <NoteText>
            {pollingState
              ? 'Your case is being generated in the background. You can safely navigate away — come back to find it in My Cases.'
              : 'Multi-step generation in progress: concept design, suspect construction, evidence drafting, timeline synthesis, and final validation. This usually takes 1-2 minutes.'
            }
          </NoteText>
        </LoadingWrapper>
      )}
    </Container>
  );
};

export default CreateCase;
