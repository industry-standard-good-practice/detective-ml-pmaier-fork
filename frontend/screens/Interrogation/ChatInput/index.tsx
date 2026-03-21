
import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { type } from '../../../theme';
import { Evidence, TimelineStatement } from '../../../types';

// Sub-components
import EvidencePicker from './EvidencePicker';
import TypePicker from './TypePicker';
import VoiceInput from './VoiceInput';

// --- Styled Components ---

const InputContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space);
  padding: calc(var(--space) * 3);
  width: 100%;
  background: #080808;
  border-top: 1px solid var(--color-border);
  
  @media (max-width: 768px) {
    padding: 10px var(--screen-edge-horizontal);
    padding-bottom: calc(var(--screen-edge-bottom) + 15px);
  }
`;

const UnifiedInputBar = styled.div<{ $disabled: boolean }>`
  display: flex;
  align-items: center;
  border: 1px solid var(--color-border);
  background: var(--color-surface-inset);
  height: 50px;
  opacity: ${props => props.$disabled ? 0.6 : 1};
  transition: all 0.2s;
  
  &:focus-within {
    border-color: var(--color-border-focus);
    box-shadow: 0 0 10px rgba(255,255,255,0.1);
  }
  
  @media (max-width: 768px) {
    display: none;
  }
`;

const MobileInputRow = styled.div`
  display: none;
  @media (max-width: 768px) {
    display: flex;
    align-items: center;
    border: 1px solid var(--color-border);
    background: var(--color-surface-inset);
    height: 56px;
    
    &:focus-within {
      border-color: var(--color-border-focus);
      box-shadow: 0 0 10px rgba(255,255,255,0.1);
    }
  }
`;

const MobileButtonRow = styled.div`
  display: none;
  @media (max-width: 768px) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 40px;
    margin-top: var(--space);
    
    button {
      height: 100%;
    }
  }
`;

const GhostInput = styled.input`
  flex: 1;
  background: transparent;
  border: none;
  color: var(--color-text-bright);
  font-family: 'VT323', monospace;
  ${type.bodyLg}
  padding: 0 15px;
  height: 100%;
  min-width: 0;
  
  &:focus { outline: none; }
  &::placeholder { color: var(--color-border); }
  &:disabled { color: var(--color-danger-bg); cursor: not-allowed; }
`;

const SendActionBtn = styled.button`
  height: 100%;
  padding: 0 25px;
  background: var(--color-text-bright);
  color: var(--color-text-inverse);
  border: none;
  border-left: 1px solid var(--color-border);
  font-family: inherit;
  font-weight: bold;
  ${type.body}
  cursor: pointer;
  transition: background 0.2s;
  
  &:disabled {
    background: var(--color-border-subtle);
    color: var(--color-border-strong);
    cursor: not-allowed;
  }
  
  &:hover:not(:disabled) {
    background: #ddd;
  }
  
  @media (max-width: 768px) {
    padding: 0 20px;
    order: 2;
  }
`;

const SuggestionChips = styled.div`
  display: flex;
  gap: var(--space);
  overflow-x: auto;
  padding-bottom: var(--space);
  margin-left: -20px;
  margin-right: -20px;
  padding-left: calc(var(--space) * 3 - 4px);
  padding-right: calc(var(--space) * 3);
  width: calc(100% + 40px);
  max-width: calc(100% + 40px);
  
  &::-webkit-scrollbar { height: 4px; }
  &::-webkit-scrollbar-thumb { background: var(--color-border); }
  &::-webkit-scrollbar-track { background: transparent; }
  
  @media (max-width: 768px) {
    margin-left: -10px;
    margin-right: -10px;
    padding-left: calc(var(--space) + 2px);
    padding-right: calc(var(--space) + 2px);
    margin-bottom: 0px;
    width: calc(100% + 20px);
    max-width: calc(100% + 20px);
    scrollbar-width: none;
    -ms-overflow-style: none;
    &::-webkit-scrollbar { display: none; }
  }
`;

const Chip = styled.button`
  background: var(--color-border-subtle);
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  padding: var(--space) var(--space);
  font-family: inherit;
  ${type.body}
  white-space: nowrap;
  cursor: pointer;
  flex-shrink: 0;
  
  &:hover {
    border-color: #777;
    color: var(--color-text-bright);
  }
`;

const AttachmentChipsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space);
  margin-bottom: var(--space);
`;

const AttachmentChip = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space);
  background: #1a1a1a;
  border: 1px dashed var(--color-border-strong);
  color: var(--color-text-bright);
  padding: var(--space) var(--space);
  ${type.small}

  button {
    background: transparent;
    border: none;
    color: var(--color-accent-red-bright);
    font-weight: bold;
    cursor: pointer;
    ${type.body}
    padding: 0;
    line-height: 1;
  }
`;

// --- Component ---

interface ChatInputProps {
  inputVal: string;
  setInputVal: (val: string) => void;
  inputType: 'talk' | 'action';
  setInputType: (type: 'talk' | 'action') => void;
  selectedEvidence: (Evidence | TimelineStatement)[];
  evidenceDiscovered: Evidence[];
  timelineStatementsDiscovered: TimelineStatement[];
  suggestions: (string | { label: string; text: string })[];
  showSuggestions: boolean;
  isLocked: boolean;
  isThinking: boolean;
  isDeceased: boolean;
  inputPlaceholder: string;
  onSend: () => void;
  toggleEvidence: (item: Evidence | TimelineStatement) => void;
  isEvidenceSelected: (item: Evidence | TimelineStatement) => boolean;
  inputRef: React.RefObject<HTMLInputElement>;
}

const ChatInput: React.FC<ChatInputProps> = ({
  inputVal,
  setInputVal,
  inputType,
  setInputType,
  selectedEvidence,
  evidenceDiscovered,
  timelineStatementsDiscovered,
  suggestions,
  showSuggestions,
  isLocked,
  isThinking,
  isDeceased,
  inputPlaceholder,
  onSend,
  toggleEvidence,
  isEvidenceSelected,
  inputRef,
}) => {
  const [showEvidencePicker, setShowEvidencePicker] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const evidenceMenuRef = useRef<HTMLDivElement>(null);
  const mobileEvidenceMenuRef = useRef<HTMLDivElement>(null);
  const typeMenuRef = useRef<HTMLDivElement>(null);
  const mobileTypeMenuRef = useRef<HTMLDivElement>(null);

  // Close evidence picker on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const insideDesktop = evidenceMenuRef.current?.contains(target);
      const insideMobile = mobileEvidenceMenuRef.current?.contains(target);
      if (!insideDesktop && !insideMobile) {
        setShowEvidencePicker(false);
      }
    }
    if (showEvidencePicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEvidencePicker]);

  // Close type picker on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (typeMenuRef.current && !typeMenuRef.current.contains(event.target as Node) &&
        (!mobileTypeMenuRef.current || !mobileTypeMenuRef.current.contains(event.target as Node))) {
        setShowTypePicker(false);
      }
    }
    if (showTypePicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTypePicker]);

  const handleSelectType = (t: 'talk' | 'action') => {
    setInputType(t);
    setShowTypePicker(false);
  };

  return (
    <InputContainer>
      {!isLocked && showSuggestions && suggestions.length > 0 && (
        <SuggestionChips>
          {suggestions.map((s, i) => {
            const label = typeof s === 'string' ? s : s.label;
            const text = typeof s === 'string' ? s : s.text;
            return (
              <Chip key={`${label}-${i}`} onClick={() => setInputVal(text)}>{label}</Chip>
            );
          })}
        </SuggestionChips>
      )}

      {selectedEvidence.length > 0 && (
        <AttachmentChipsRow>
          {selectedEvidence.map((ev, i) => {
            const label = 'title' in ev ? ev.title : `Timeline: ${(ev as TimelineStatement).day && (ev as TimelineStatement).day !== 'Today' ? (ev as TimelineStatement).day + ' — ' : ''}${(ev as TimelineStatement).time}`;
            return (
              <AttachmentChip key={i}>
                <span>📎 {label}</span>
                <button onClick={() => toggleEvidence(ev)}>[x]</button>
              </AttachmentChip>
            );
          })}
        </AttachmentChipsRow>
      )}

      {/* DESKTOP INPUT BAR */}
      <UnifiedInputBar $disabled={isLocked || isThinking} id="unified-input-bar">
        <TypePicker
          inputType={inputType}
          showTypePicker={showTypePicker}
          isLocked={isLocked}
          isDeceased={isDeceased}
          onToggle={() => setShowTypePicker(!showTypePicker)}
          onSelect={handleSelectType}
          menuRef={typeMenuRef}
        />

        <EvidencePicker
          evidenceDiscovered={evidenceDiscovered}
          timelineStatementsDiscovered={timelineStatementsDiscovered}
          selectedEvidence={selectedEvidence}
          isLocked={isLocked}
          showEvidencePicker={showEvidencePicker}
          setShowEvidencePicker={setShowEvidencePicker}
          isEvidenceSelected={isEvidenceSelected}
          toggleEvidence={toggleEvidence}
          menuRef={evidenceMenuRef}
        />

        <GhostInput
          ref={inputRef}
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSend()}
          placeholder={inputPlaceholder}
          disabled={isLocked || isThinking}
        />

        <SendActionBtn onClick={onSend} disabled={isLocked || isThinking}>
          SEND
        </SendActionBtn>

        <VoiceInput inputVal={inputVal} setInputVal={setInputVal} inputRef={inputRef} />
      </UnifiedInputBar>

      {/* MOBILE INPUT */}
      <div id="unified-input-bar-mobile">
        <MobileInputRow>
          <EvidencePicker
            evidenceDiscovered={evidenceDiscovered}
            timelineStatementsDiscovered={timelineStatementsDiscovered}
            selectedEvidence={selectedEvidence}
            isLocked={isLocked}
            showEvidencePicker={showEvidencePicker}
            setShowEvidencePicker={setShowEvidencePicker}
            isEvidenceSelected={isEvidenceSelected}
            toggleEvidence={toggleEvidence}
            menuRef={mobileEvidenceMenuRef}
          />
          <GhostInput
            ref={inputRef}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSend()}
            placeholder={inputPlaceholder}
            disabled={isLocked || isThinking}
          />
        </MobileInputRow>
        <MobileButtonRow>
          <TypePicker
            inputType={inputType}
            showTypePicker={showTypePicker}
            isLocked={isLocked}
            isDeceased={isDeceased}
            onToggle={() => setShowTypePicker(!showTypePicker)}
            onSelect={handleSelectType}
            menuRef={mobileTypeMenuRef}
          />
          <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <SendActionBtn onClick={onSend} disabled={isLocked || isThinking}>
              SEND
            </SendActionBtn>
            <VoiceInput inputVal={inputVal} setInputVal={setInputVal} inputRef={inputRef} />
          </div>
        </MobileButtonRow>
      </div>
    </InputContainer>
  );
};

export default ChatInput;
