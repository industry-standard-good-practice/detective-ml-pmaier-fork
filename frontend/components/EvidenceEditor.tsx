
import React, { useState, useRef, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { Evidence, Suspect } from '../types';
import { TextInput, TextArea, Button, Dropdown, Checkbox } from './ui';
import type { DropdownOption } from './ui';
import { ImageSlot } from './ui/PixelImage';
import { type } from '../theme';
import { type ImageLoadingState } from './SuspectPortrait';
import Spinner from './Spinner';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: calc(var(--space) * 1.25);
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: calc(var(--space) * 0.625);

  label {
    ${type.label}
    color: var(--color-text-disabled);
  }
`;

const AddButton = styled(Button).attrs({ $variant: 'accent' as const })`
  ${type.small}
  padding: calc(var(--space) * 0.5) calc(var(--space) * 1.25);
`;

const EvidenceCard = styled.div`
  background: var(--color-surface-raised);
  padding: calc(var(--space) * 1.25);
  display: flex;
  flex-direction: column;
  gap: var(--space);
  border-bottom: 1px dashed var(--color-border);
`;

const CardTop = styled.div`
  display: flex;
  gap: calc(var(--space) * 1.25);
`;

const RerollButton = styled.button`
  ${type.small}
  background: rgba(0,0,0,0.7);
  color: var(--color-text-bright);
  border: none;
  padding: 0;
  cursor: pointer;
  width: 100%;
  text-align: center;

  &:hover { background: rgba(50,50,50,0.9); }
`;

const ContentCol = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: calc(var(--space) * 0.625);
  min-width: 0;
`;

const CardBottom = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: calc(var(--space) * 1.25);
`;

const RemoveButton = styled(Button).attrs({ $variant: 'ghost' as const })`
  ${type.small}
  color: var(--color-text-disabled);
  border: 1px solid var(--color-border);
  padding: calc(var(--space) * 0.5) calc(var(--space) * 1.25);
  

  &:hover {
    color: var(--color-accent-red-bright);
    border-color: var(--color-accent-red-bright);
    background: rgba(255, 85, 85, 0.15);
  }
  
  @media (max-width: 768px) {
    color: var(--color-accent-red-bright);
    border-color: var(--color-accent-red-bright);
  }
`;

const EmptyState = styled.div`
  ${type.body}
  color: var(--color-text-dim);
  font-style: italic;
  padding: calc(var(--space) * 1.25);
  border: 1px dashed var(--color-border);
`;

const DISCOVERY_CONTEXT_OPTIONS: DropdownOption[] = [
  { value: 'body', label: 'On body / clothing' },
  { value: 'environment', label: 'In room / scene' },
];

/* ─── Evidence Loading Overlay ─── */

const pulse = keyframes`
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
`;

const EvidenceImageWrapper = styled.div`
  position: relative;
  width: 60px;
  height: 60px;
  flex-shrink: 0;
`;

const EvidenceLoadingOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  z-index: 2;
  pointer-events: none;
`;

const EvidenceWaitDots = styled.div`
  display: flex;
  gap: 3px;
  & > span {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--color-text-dim);
    animation: ${pulse} 1.2s ease-in-out infinite;
  }
  & > span:nth-child(2) { animation-delay: 0.2s; }
  & > span:nth-child(3) { animation-delay: 0.4s; }
`;

/* ─── Custom Ownership Dropdown ─── */

const DropdownWrapper = styled.div`
  position: relative;
`;

const DropdownTrigger = styled.button`
  ${type.small}
  background: var(--color-surface-inset);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  padding: var(--space) calc(var(--space) * 3) var(--space) var(--space);
  cursor: pointer;
  text-align: left;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  position: relative;
  text-transform: none;

  /* Dropdown arrow */
  &::after {
    content: '▼';
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    ${type.xs}
    color: var(--color-text-dim);
    pointer-events: none;
  }

  &:hover {
    border-color: var(--color-border-strong);
    color: var(--color-text);
  }
`;

const DropdownMenu = styled.div`
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  background: var(--color-surface-inset);
  border: 1px solid var(--color-border-strong);
  min-width: 200px;
  max-height: 250px;
  overflow-y: auto;
  z-index: 50;
  box-shadow: 0 -4px 20px rgba(0,0,0,0.6);

  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-thumb { background: var(--color-border); }
`;

const DropdownOption = styled.button<{ $active?: boolean }>`
  ${type.small}
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

/** Ownership key: 'initial' for initial evidence, or the suspect's ID */
type OwnerKey = 'initial' | string;

interface OwnershipDropdownProps {
  value: OwnerKey;
  suspects: Suspect[];
  onChange: (newOwner: OwnerKey) => void;
}

const OwnershipDropdown: React.FC<OwnershipDropdownProps> = ({ value, suspects, onChange }) => {
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

  const currentLabel = value === 'initial'
    ? 'Initial Evidence'
    : suspects.find(s => s.id === value)?.name || value;

  return (
    <DropdownWrapper ref={ref}>
      <DropdownTrigger onClick={() => setOpen(!open)} title="Evidence owner">
        {currentLabel}
      </DropdownTrigger>
      {open && (
        <DropdownMenu>
          <DropdownOption
            $active={value === 'initial'}
            onClick={() => { onChange('initial'); setOpen(false); }}
          >
            {value === 'initial' && <ActiveDot />}
            Initial Evidence
          </DropdownOption>
          {suspects.map(s => (
            <DropdownOption
              key={s.id}
              $active={value === s.id}
              onClick={() => { onChange(s.id); setOpen(false); }}
            >
              {value === s.id && <ActiveDot />}
              {s.name}{s.isDeceased ? ' (Victim)' : ''}{s.isGuilty ? ' ★' : ''}
            </DropdownOption>
          ))}
        </DropdownMenu>
      )}
    </DropdownWrapper>
  );
};

/* ─── Main Component ─── */

interface EvidenceEditorProps {
  label: string;
  evidenceList: Evidence[];
  onChange: (newList: Evidence[]) => void;
  onRerollImage?: (ev: Evidence) => void;
  /** Current owner key – 'initial' or a suspect ID */
  ownerKey?: OwnerKey;
  /** All suspects (for ownership dropdown options) */
  suspects?: Suspect[];
  /** Callback when evidence should be transferred to a different owner */
  onTransferEvidence?: (evidence: Evidence, fromOwner: OwnerKey, toOwner: OwnerKey) => void;
  /** Per-evidence loading states, keyed by `ev-${evidence.id}` */
  imageLoadingStates?: Record<string, ImageLoadingState>;
  /** Victim card: clue is on body vs in room; drives examination + image prompts */
  victimExamMode?: boolean;
}

const EvidenceEditor: React.FC<EvidenceEditorProps> = ({
  label,
  evidenceList = [],
  onChange,
  onRerollImage,
  ownerKey,
  suspects,
  onTransferEvidence,
  imageLoadingStates,
  victimExamMode = false,
}) => {

  const handleChange = (index: number, field: 'title' | 'location' | 'description', value: string) => {
    const newList = [...evidenceList];
    newList[index] = { ...newList[index], [field]: value };
    onChange(newList);
  };

  const handleAdd = () => {
    const base: Evidence = {
      id: `new-${Date.now()}`,
      title: "New Item",
      location: "",
      description: "Description...",
      imageUrl: undefined
    };
    if (victimExamMode) {
      base.discoveryContext = 'body';
    }
    onChange([...evidenceList, base]);
  };

  const handleDelete = (index: number) => {
    const newList = [...evidenceList];
    newList.splice(index, 1);
    onChange(newList);
  };

  const showOwnership = ownerKey !== undefined && suspects && onTransferEvidence;

  return (
    <Container>
      <Header>
        <label>{label}</label>
        <AddButton onClick={handleAdd}>+ ADD CARD</AddButton>
      </Header>
      {evidenceList.map((ev, i) => (
        <EvidenceCard key={ev.id || i}>
          <CardTop>
            <EvidenceImageWrapper>
              <ImageSlot $src={ev.imageUrl}>
                {onRerollImage && (
                  <RerollButton onClick={() => onRerollImage(ev)} title="Generate new pixel art">
                    REROLL
                  </RerollButton>
                )}
              </ImageSlot>
              {(() => {
                const loadState = imageLoadingStates?.[`ev-${ev.id}`];
                if (!loadState) return null;
                return (
                  <EvidenceLoadingOverlay>
                    {loadState === 'generating' ? (
                      <Spinner $size={18} />
                    ) : (
                      <EvidenceWaitDots>
                        <span /><span /><span />
                      </EvidenceWaitDots>
                    )}
                  </EvidenceLoadingOverlay>
                );
              })()}
            </EvidenceImageWrapper>

            <ContentCol>
              <TextInput
                value={ev.title}
                onChange={(e) => handleChange(i, 'title', e.target.value)}
                placeholder="Title"
              />
              <TextInput
                value={ev.location ?? ''}
                onChange={(e) => handleChange(i, 'location', e.target.value)}
                placeholder={
                  victimExamMode
                    ? (ev.discoveryContext === 'environment' ? "Where in the room (e.g. under nightstand)" : "Where on body (e.g. inner breast pocket)")
                    : ownerKey === 'initial'
                      ? "Where found (crime scene)"
                      : "Where hidden (e.g. inner breast pocket)"
                }
              />
              {victimExamMode && (
                <Dropdown
                  title="Where this clue is found"
                  options={DISCOVERY_CONTEXT_OPTIONS}
                  value={ev.discoveryContext === 'environment' ? 'environment' : 'body'}
                  onChange={(raw) => {
                    const newList = [...evidenceList];
                    const v = raw as 'body' | 'environment';
                    const next: Evidence = { ...newList[i], discoveryContext: v };
                    if (v === 'body') {
                      delete next.environmentIncludesBody;
                    } else if (next.environmentIncludesBody === undefined) {
                      next.environmentIncludesBody = false;
                    }
                    newList[i] = next;
                    onChange(newList);
                  }}
                />
              )}
              {victimExamMode && ev.discoveryContext === 'environment' && (
                <Checkbox
                  checked={ev.environmentIncludesBody === true}
                  onChange={(nextChecked) => {
                    const newList = [...evidenceList];
                    newList[i] = { ...newList[i], environmentIncludesBody: nextChecked };
                    onChange(newList);
                  }}
                >
                  Evidence image may include body (background)
                </Checkbox>
              )}
              <TextArea
                value={ev.description}
                onChange={(e) => handleChange(i, 'description', e.target.value)}
                placeholder="Description..."
              />
            </ContentCol>
          </CardTop>

          <CardBottom>
            {showOwnership ? (
              <OwnershipDropdown
                value={ownerKey!}
                suspects={suspects!}
                onChange={(newOwner) => {
                  if (newOwner !== ownerKey) {
                    onTransferEvidence(ev, ownerKey!, newOwner);
                  }
                }}
              />
            ) : (
              <span />
            )}
            <RemoveButton onClick={() => handleDelete(i)} title="Remove Item">
              REMOVE
            </RemoveButton>
          </CardBottom>
        </EvidenceCard>
      ))}
      {evidenceList.length === 0 && (
        <EmptyState>No evidence items listed.</EmptyState>
      )}
    </Container>
  );
};

export default EvidenceEditor;
