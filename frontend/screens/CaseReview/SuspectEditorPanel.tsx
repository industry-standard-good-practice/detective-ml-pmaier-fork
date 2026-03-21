
import React, { useState, useRef, useEffect } from 'react';
import { type } from '../../theme';
import styled from 'styled-components';
import { CaseData, Suspect, Emotion, Evidence, Relationship, TimelineEvent } from '../../types';
import { TTS_VOICES } from '../../constants';
import EvidenceEditor from '@/components/EvidenceEditor';
import SuspectPortrait from '@/components/SuspectPortrait';

// --- Styled Components ---

const Panel = styled.div<{ $mobileHidden?: boolean }>`
  flex: 1;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  padding: calc(var(--space) * 3);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  gap: calc(var(--space) * 3);

  @media (max-width: 1080px) {
    display: ${props => props.$mobileHidden ? 'none' : 'flex'};
    padding: calc(var(--space) * 2);
    min-height: 0;
    min-width: 0;
    flex: 1;
    overflow-x: hidden;
  }
`;

const InputGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space);
  min-width: 0;
  max-width: 100%;

  label {
    color: var(--color-text-disabled);
    ${type.small}
    text-transform: uppercase;
  }

  input, textarea, select {
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    color: var(--color-text);
    font-family: inherit;
    padding: var(--space);
    ${type.body}
    box-sizing: border-box;
    max-width: 100%;
    width: 100%;

    &:focus {
      border-color: var(--color-text-subtle);
      outline: none;
    }
  }

  textarea {
    resize: none;
    padding: var(--space);
    field-sizing: content;
  }
`;

const StyledInput = styled.input`
  background: var(--color-surface-raised);
  border: none;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text);
  font-family: inherit;
  padding: var(--space);
  ${type.body}
  width: 100%;
  box-sizing: border-box;
  min-width: 0;
  &:focus {
    border-bottom-color: var(--color-accent-green);
    background: var(--color-surface-raised);
    outline: none;
  }
`;

const StyledTextArea = styled.textarea`
  background: var(--color-surface-raised);
  border: none;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text);
  font-family: inherit;
  padding: var(--space);
  ${type.body}
  resize: none;
  width: 100%;
  box-sizing: border-box;
  min-width: 0;
  field-sizing: content;
  &:focus {
    border-bottom-color: var(--color-accent-green);
    background: var(--color-surface-raised);
    outline: none;
  }
`;

const ModuleContainer = styled.div`
  padding: 5px 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--space) * 2);
`;

const ModuleItem = styled.div`
  border-bottom: 1px dashed var(--color-border);
  padding-bottom: calc(var(--space) * 2);
  &:last-child { border-bottom: none; padding-bottom: 0; }
  display: flex;
  flex-direction: column;
  gap: var(--space);
  min-width: 0;
  max-width: 100%;
`;

const Fieldset = styled.fieldset`
  border: none;
  border-top: 1px solid var(--color-border);
  padding: 15px 0 0 0;
  margin: 20px 0 0 0;
  background: transparent;
  min-width: 0;
  legend {
    color: var(--color-text-subtle);
    padding: 0 10px 0 0;
    ${type.small}
    text-transform: uppercase;
    font-weight: bold;
  }
`;

const SuspectList = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space);
`;

const SuspectRow = styled.div<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  gap: var(--space);
  padding: var(--space);
  background: ${props => props.$selected ? 'var(--color-border-subtle)' : '#0f0f0f'};
  border: 1px solid ${props => props.$selected ? 'var(--color-text-bright)' : 'var(--color-border)'};
  cursor: pointer;
  min-width: 0;
  &:hover { background: var(--color-border-subtle); }
  & > div { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
`;

const SuspectEditorRow = styled.div`
  display: flex;
  gap: var(--space);
  @media (max-width: 1080px) { flex-direction: column; }
`;

const PortraitCol = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space);
  width: 160px;
  flex-shrink: 0;
  @media (max-width: 1080px) { width: 100%; }
`;

const PortraitBtnGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space);
  @media (max-width: 1080px) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space);
    & > *:first-child { grid-column: 1 / -1; }
  }
`;

const InputsCol = styled.div`
  flex: 1;
  min-width: 0;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space);
  overflow: hidden;
`;

const UtilityButton = styled.button<{ $danger?: boolean }>`
  background: ${props => props.$danger ? '#300' : 'var(--color-border-subtle)'};
  color: ${props => props.$danger ? 'var(--color-accent-red-bright)' : '#ccc'};
  border: 1px solid ${props => props.$danger ? '#500' : 'var(--color-border)'};
  padding: var(--space);
  cursor: pointer;
  font-family: inherit;
  ${type.small}
  text-transform: uppercase;
  &:hover {
    background: ${props => props.$danger ? '#500' : '#333'};
    color: var(--color-text-bright);
  }
`;

const SmallButton = styled.button<{ $active?: boolean }>`
  background: ${props => props.$active ? '#3b82f6' : '#333'};
  color: ${props => props.$active ? 'var(--color-text-bright)' : '#ccc'};
  border: 1px solid ${props => props.$active ? '#60a5fa' : 'var(--color-border-strong)'};
  cursor: pointer;
  padding: var(--space) var(--space);
  ${type.small}
  font-family: inherit;
  transition: all 0.2s;
  &:hover { background: ${props => props.$active ? '#2563eb' : '#555'}; }
`;

const RetryButton = styled.button`
  background: #0e0e0e;
  color: var(--color-accent-cyan);
  border: 1px dashed #088;
  padding: calc(var(--space) * 2);
  font-family: inherit;
  ${type.body}
  cursor: pointer;
  margin-bottom: var(--space);
  transition: all 0.2s;
  &:hover:not(:disabled) {
    background: #002222;
    border-color: #0ff;
    box-shadow: 0 0 10px rgba(0, 255, 255, 0.1);
  }
  &:disabled { opacity: 0.5; cursor: wait; }
`;

const RandomizeButton = styled.button`
  background: var(--color-border);
  color: var(--color-text-bright);
  border: 1px solid var(--color-border-strong);
  cursor: pointer;
  padding: var(--space) calc(var(--space) * 2);
  font-family: inherit;
  ${type.small}
  width: 100%;
  transition: all 0.2s;
  &:hover { background: var(--color-border-strong); }
  &:disabled { opacity: 0.5; cursor: wait; }
`;

const UploadButton = styled.button`
  background: #234;
  color: #adf;
  border: 1px solid #456;
  cursor: pointer;
  padding: var(--space) calc(var(--space) * 2);
  font-family: inherit;
  ${type.small}
  width: 100%;
  transition: all 0.2s;
  &:hover { background: #345; }
  &:disabled { opacity: 0.5; cursor: wait; }
`;

const PasteButton = styled.button`
  background: #324;
  color: #daf;
  border: 1px solid #546;
  cursor: pointer;
  padding: var(--space) calc(var(--space) * 2);
  font-family: inherit;
  ${type.small}
  width: 100%;
  transition: all 0.2s;
  &:hover { background: #435; }
  &:disabled { opacity: 0.5; cursor: wait; }
`;

const CameraButton = styled.button`
  background: #422;
  color: #fa0;
  border: 1px solid #633;
  cursor: pointer;
  padding: var(--space) calc(var(--space) * 2);
  font-family: inherit;
  ${type.small}
  width: 100%;
  transition: all 0.2s;
  &:hover { background: #533; }
  &:disabled { opacity: 0.5; cursor: wait; }
`;

const DeleteButton = styled.button`
  background: transparent;
  color: var(--color-text-disabled);
  border: 1px solid var(--color-border);
  cursor: pointer;
  padding: var(--space) calc(var(--space) * 2);
  ${type.small}
  font-family: inherit;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space);
  flex-shrink: 0;
  text-transform: uppercase;
  font-weight: bold;
  line-height: 1;
  text-align: center;
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

const XIcon = styled.span`
  display: inline-block;
  width: 10px;
  height: 10px;
  position: relative;
  flex-shrink: 0;
  &::before, &::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 100%;
    height: 2px;
    background: currentColor;
  }
  &::before { transform: translate(-50%, -50%) rotate(45deg); }
  &::after { transform: translate(-50%, -50%) rotate(-45deg); }
`;

const ToggleButton = styled.button<{ $active?: boolean }>`
  background: ${props => props.$active ? 'rgba(255, 85, 85, 0.15)' : 'transparent'};
  color: ${props => props.$active ? 'var(--color-accent-red-bright)' : 'var(--color-text-disabled)'};
  border: 1px solid ${props => props.$active ? 'var(--color-accent-red-bright)' : 'var(--color-border)'};
  cursor: pointer;
  padding: var(--space) calc(var(--space) * 2);
  ${type.small}
  font-family: inherit;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: var(--space);
  text-transform: uppercase;
  font-weight: bold;
  flex-shrink: 0;
  line-height: 1;
  text-align: center;
  &:hover {
    color: ${props => props.$active ? 'var(--color-accent-red-bright)' : 'var(--color-text-bright)'};
    border-color: ${props => props.$active ? 'var(--color-accent-red-bright)' : 'var(--color-text-subtle)'};
    background: ${props => props.$active ? 'rgba(255, 85, 85, 0.15)' : 'rgba(255,255,255,0.1)'};
  }
`;

const SaveButton = styled.button`
  background: #004400;
  color: var(--color-accent-green);
  border: 1px solid var(--color-accent-green);
  padding: calc(var(--space) * 2);
  font-family: inherit;
  ${type.body}
  font-weight: bold;
  cursor: pointer;
  text-transform: uppercase;
  &:hover { background: #006600; color: var(--color-text-bright); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const StartButton = styled.button`
  flex: 1;
  background: #0d0;
  color: var(--color-text-inverse);
  border: none;
  padding: calc(var(--space) * 2);
  font-family: inherit;
  ${type.bodyLg}
  font-weight: bold;
  cursor: pointer;
  &:hover { background: #5f5; }
`;

const MobileOnly = styled.div`
  display: none;
  @media (max-width: 1080px) {
    display: flex;
    flex-direction: column;
    gap: var(--space);
    margin-top: auto;
    padding-top: var(--space);
  }
`;

const PanelHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const PanelTitle = styled.h2`
  margin: 0;
  color: #fff;
`;

const SupportSuspectRow = styled(SuspectRow)`
  border-left: 3px solid #3b82f6;
`;

const SuspectInfo = styled.div`
  flex: 1;
`;

const SuspectName = styled.div`
  font-weight: bold;
  font-size: var(--type-body);
`;

const SuspectRole = styled.div`
  font-size: var(--type-small);
  color: #888;
`;

const GuiltyTag = styled.span`
  color: red;
  font-weight: bold;
`;

const EditorSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: calc(var(--space) * 2);
  margin-top: calc(var(--space) * 3);
  border-top: 1px solid #333;
  padding-top: calc(var(--space) * 3);
  min-width: 0;
  max-width: 100%;
`;

const EditorHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space);
`;

const EditorControls = styled.div`
  display: flex;
  gap: var(--space);
  align-items: center;
`;

const EditorTitle = styled.h3`
  margin: 0;
  color: #aaa;
  font-size: var(--type-h3);
`;

const FlexRow = styled.div`
  display: flex;
  gap: var(--space);
  min-width: 0;
  max-width: 100%;
`;

const FlexRowAligned = styled(FlexRow)`
  align-items: center;
`;

const FlexInputGroup = styled(InputGroup)`
  flex: 1;
`;

const NarrowInputGroup = styled(InputGroup)`
  width: 80px;
`;

/* ─── Custom Voice Dropdown (matches evidence ownership dropdown) ─── */

const VoiceDropdownWrapper = styled.div`
  position: relative;
  flex: 1;
  min-width: 0;
`;

const VoiceDropdownTrigger = styled.button`
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

const VoiceDropdownMenu = styled.div`
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

const VoiceDropdownOption = styled.button<{ $active?: boolean }>`
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

const VoiceActiveDot = styled.span`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-accent-green);
  flex-shrink: 0;
`;

const PreviewButton = styled.button`
  ${type.body}
  padding: var(--space) calc(var(--space) * 1.5);
  background: var(--color-surface-raised);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  font-family: inherit;
  white-space: nowrap;
  box-sizing: border-box;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:not(:disabled) { cursor: pointer; }
  &:hover:not(:disabled) { border-color: var(--color-text-subtle); }
`;

const AccentInput = styled.input`
  background: var(--color-surface-raised);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  padding: var(--space);
  ${type.body}
  font-family: inherit;
  flex: 1;
  min-width: 80px;
  box-sizing: border-box;
  &::placeholder { color: var(--color-text-dim); }
  &:focus { border-color: var(--color-text-subtle); outline: none; }
`;

const VoiceDropdown: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
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

  const currentVoice = TTS_VOICES.find(v => v.name === value);
  const label = !currentVoice || value === 'None'
    ? 'No Voice'
    : `${currentVoice.name} (${currentVoice.gender})`;

  return (
    <VoiceDropdownWrapper ref={ref}>
      <VoiceDropdownTrigger onClick={() => setOpen(!open)} title="TTS Voice">
        {label}
      </VoiceDropdownTrigger>
      {open && (
        <VoiceDropdownMenu>
          {TTS_VOICES.map(v => (
            <VoiceDropdownOption
              key={v.name}
              $active={value === v.name}
              onClick={() => { onChange(v.name); setOpen(false); }}
            >
              {value === v.name && <VoiceActiveDot />}
              {v.name === 'None' ? 'No Voice (Silent)' : `${v.name} (${v.gender})`}
            </VoiceDropdownOption>
          ))}
        </VoiceDropdownMenu>
      )}
    </VoiceDropdownWrapper>
  );
};

const EditPortraitButton = styled(RandomizeButton)`
  background: #3b82f6;
`;

const AlibiRow = styled.div`
  display: flex;
  gap: var(--space);
  margin-top: var(--space);
  align-items: flex-end;
`;

const AlibiToggle = styled(ToggleButton)`
  padding: calc(var(--space) + 3.4px) calc(var(--space) * 2);
  font-size: var(--type-body);
`;

const RelTargetLabel = styled.div`
  flex: 1;
  color: #fff;
  font-size: var(--type-body-lg);
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const RelTypeInput = styled(StyledInput)`
  width: 120px;
`;

const TimelineModuleItem = styled(ModuleItem)`
  flex-direction: row;
  align-items: center;
`;

const FactModuleItem = styled(ModuleItem)`
  flex-direction: row;
  align-items: flex-start;
`;

const TimelineFlexCol = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space);
`;

const TimelineDayInput = styled(StyledInput)`
  flex: 2;
`;

const TimelineOffsetInput = styled(StyledInput)`
  flex: 0 0 auto;
  width: 90px;
  min-width: 90px;
  text-align: center;
`;

const SideDeleteButton = styled(DeleteButton)`
  margin-left: var(--space);
  align-self: stretch;
`;

const AddButton = styled(SmallButton)`
  padding: var(--space);
  background: #222;
`;

const MobileButtonRow = styled.div`
  display: flex;
  gap: var(--space);
  width: 100%;
`;

const FlexSaveButton = styled(SaveButton)`
  flex: 1;
`;

const CloseButton = styled(FlexSaveButton)`
  background: #444;
  color: #ccc;
`;

// --- Props ---

interface SuspectEditorPanelProps {
  draftCase: CaseData;
  mobileTab: 'case' | 'suspects';
  selectedSuspectId: string | null;
  setSelectedSuspectId: (id: string | null) => void;
  loadingVisible: boolean;
  isPreviewingVoice: boolean;
  onSuspectChange: (id: string, field: string, value: any) => void;
  onCaseChange: (field: string, value: any) => void;
  onAddSuspect: () => void;
  onDeleteSuspect: () => void;
  onRetryAI: () => void;
  onRerollPortrait: () => void;
  onShowSuspectEditor: () => void;
  onTriggerUpload: () => void;
  onPasteFromClipboard: (callback: (base64: string) => void) => void;
  onProcessSuspectImage: (base64: string) => void;
  onStartCamera: () => void;
  onPreviewVoice: () => void;
  onRerollEvidence: (ev: Evidence, source: 'initial' | 'hidden', suspectId?: string) => void;
  onTransferEvidence: (evidence: Evidence, fromOwner: string, toOwner: string) => void;
  onSave: () => void;
  onCheckConsistency: () => void;
  onCancel: () => void;
  onStart: () => void;
}

const SuspectEditorPanel: React.FC<SuspectEditorPanelProps> = ({
  draftCase,
  mobileTab,
  selectedSuspectId,
  setSelectedSuspectId,
  loadingVisible,
  isPreviewingVoice,
  onSuspectChange,
  onCaseChange,
  onAddSuspect,
  onDeleteSuspect,
  onRetryAI,
  onRerollPortrait,
  onShowSuspectEditor,
  onTriggerUpload,
  onPasteFromClipboard,
  onProcessSuspectImage,
  onStartCamera,
  onPreviewVoice,
  onRerollEvidence,
  onTransferEvidence,
  onSave,
  onCheckConsistency,
  onCancel,
  onStart,
}) => {
  const activeSuspect = selectedSuspectId === 'officer' ? draftCase.officer :
    selectedSuspectId === 'partner' ? draftCase.partner :
      draftCase.suspects?.find(s => s.id === selectedSuspectId);
  const isSupportChar = selectedSuspectId === 'officer' || selectedSuspectId === 'partner';

  const deceasedSuspect = draftCase.suspects?.find(s => s.isDeceased);
  const otherSuspects = draftCase.suspects?.filter(s => s.id !== activeSuspect?.id) || [];

  const relationshipTargets: string[] = [];
  if (activeSuspect) {
    if (!isSupportChar && !(activeSuspect as Suspect).isDeceased) {
      if (draftCase.hasVictim !== false) {
        relationshipTargets.push("The Victim");
      }
      otherSuspects.forEach(s => {
        if (!s.isDeceased) relationshipTargets.push(s.name);
      });
    } else {
      otherSuspects.forEach(s => {
        if (!s.isDeceased) relationshipTargets.push(s.name);
      });
    }
  }

  const handleRelationshipChange = (targetName: string, field: 'type' | 'description', value: string) => {
    if (!activeSuspect || isSupportChar) return;
    const currentSuspect = activeSuspect as Suspect;
    let newRels = [...(currentSuspect.relationships || [])];
    const index = newRels.findIndex(r => r.targetName === targetName);
    if (index >= 0) {
      newRels[index] = { ...newRels[index], [field]: value };
    } else {
      newRels.push({
        targetName,
        type: field === 'type' ? value : 'Acquaintance',
        description: field === 'description' ? value : ''
      });
    }
    onSuspectChange(activeSuspect.id, 'relationships', newRels);
  };

  const updateTimeline = (index: number, key: keyof TimelineEvent, val: string) => {
    if (!activeSuspect || isSupportChar) return;
    const currentSuspect = activeSuspect as Suspect;
    const newTime = [...currentSuspect.timeline];
    newTime[index] = { ...newTime[index], [key]: val };
    onSuspectChange(activeSuspect.id, 'timeline', newTime);
  };

  const addTimelineEvent = () => {
    if (!activeSuspect || isSupportChar) return;
    const currentSuspect = activeSuspect as Suspect;
    onSuspectChange(activeSuspect.id, 'timeline', [...currentSuspect.timeline, { time: "12:00 PM", activity: "Doing something", day: "Today", dayOffset: 0 }]);
  };

  const removeTimelineEvent = (index: number) => {
    if (!activeSuspect || isSupportChar) return;
    const currentSuspect = activeSuspect as Suspect;
    const newTime = [...currentSuspect.timeline];
    newTime.splice(index, 1);
    onSuspectChange(activeSuspect.id, 'timeline', newTime);
  };

  const updateFact = (index: number, val: string) => {
    if (!activeSuspect || isSupportChar) return;
    const currentSuspect = activeSuspect as Suspect;
    const newFacts = [...currentSuspect.knownFacts];
    newFacts[index] = val;
    onSuspectChange(activeSuspect.id, 'knownFacts', newFacts);
  };

  const addFact = () => {
    if (!activeSuspect || isSupportChar) return;
    const currentSuspect = activeSuspect as Suspect;
    onSuspectChange(activeSuspect.id, 'knownFacts', [...currentSuspect.knownFacts, "New Fact"]);
  };

  const removeFact = (index: number) => {
    if (!activeSuspect || isSupportChar) return;
    const currentSuspect = activeSuspect as Suspect;
    const newFacts = [...currentSuspect.knownFacts];
    newFacts.splice(index, 1);
    onSuspectChange(activeSuspect.id, 'knownFacts', newFacts);
  };

  return (
    <Panel $mobileHidden={mobileTab !== 'suspects'}>
      <PanelHeader>
        <PanelTitle>Suspects</PanelTitle>
        <UtilityButton onClick={onAddSuspect}>+ ADD SUSPECT</UtilityButton>
      </PanelHeader>

      <RetryButton onClick={onRetryAI} disabled={loadingVisible}>
        ⚡ RETRY AI GENERATION (Fix broken images)
      </RetryButton>

      <SuspectList>
        {/* Support Characters */}
        <SupportSuspectRow
          $selected={selectedSuspectId === 'officer'}
          onClick={() => setSelectedSuspectId('officer')}
        >
          <SuspectPortrait suspect={draftCase.officer as any} size={50} />
          <SuspectInfo>
            <SuspectName>{draftCase.officer.name} (CHIEF)</SuspectName>
            <SuspectRole>{draftCase.officer.role}</SuspectRole>
          </SuspectInfo>
        </SupportSuspectRow>

        <SupportSuspectRow
          $selected={selectedSuspectId === 'partner'}
          onClick={() => setSelectedSuspectId('partner')}
        >
          <SuspectPortrait suspect={draftCase.partner as any} size={50} />
          <SuspectInfo>
            <SuspectName>{draftCase.partner.name} (PARTNER)</SuspectName>
            <SuspectRole>{draftCase.partner.role}</SuspectRole>
          </SuspectInfo>
        </SupportSuspectRow>

        {(draftCase.suspects || []).map(s => (
          <SuspectRow
            key={s.id}
            $selected={s.id === selectedSuspectId}
            onClick={() => setSelectedSuspectId(s.id)}
          >
            <SuspectPortrait suspect={s} size={50} />
            <SuspectInfo>
              <SuspectName>{s.name}</SuspectName>
              <SuspectRole>{s.role}</SuspectRole>
            </SuspectInfo>
            {s.isGuilty && <GuiltyTag>[GUILTY]</GuiltyTag>}
          </SuspectRow>
        ))}
      </SuspectList>

      {activeSuspect && (
        <EditorSection>

          <EditorHeader>
            <EditorTitle>
              EDITING: {activeSuspect.name} {selectedSuspectId === 'officer' ? '(CHIEF)' : selectedSuspectId === 'partner' ? '(PARTNER)' : ''}
            </EditorTitle>
            {!isSupportChar && (
              <EditorControls>
                <ToggleButton
                  $active={(activeSuspect as Suspect).isGuilty}
                  onClick={() => onSuspectChange(activeSuspect.id, 'isGuilty', !(activeSuspect as Suspect).isGuilty)}
                  data-cursor="pointer"
                >
                  {(activeSuspect as Suspect).isGuilty ? '✓' : <XIcon />} GUILTY
                </ToggleButton>
                <DeleteButton onClick={onDeleteSuspect} title="Remove Suspect" data-cursor="pointer">
                  <XIcon /> REMOVE
                </DeleteButton>
              </EditorControls>
            )}
          </EditorHeader>

          <SuspectEditorRow>
            <PortraitCol>
              <SuspectPortrait
                suspect={activeSuspect as any}
                style={{ width: '100%', height: 'auto', aspectRatio: '1' }}
              />
              <PortraitBtnGrid>
                <RandomizeButton onClick={onRerollPortrait} disabled={loadingVisible}>
                  REROLL
                </RandomizeButton>
                <EditPortraitButton
                  onClick={onShowSuspectEditor}
                  disabled={loadingVisible}
                >
                  {activeSuspect.portraits?.[Emotion.NEUTRAL] ? 'EDIT' : 'CREATE'}
                </EditPortraitButton>
                <UploadButton onClick={onTriggerUpload} disabled={loadingVisible}>
                  UPLOAD REF
                </UploadButton>
                <PasteButton onClick={() => onPasteFromClipboard(onProcessSuspectImage)} disabled={loadingVisible}>
                  PASTE
                </PasteButton>
                <CameraButton onClick={onStartCamera} disabled={loadingVisible}>
                  TAKE PHOTO
                </CameraButton>
              </PortraitBtnGrid>
            </PortraitCol>

            <InputsCol>
              <FlexRow>
                <FlexInputGroup>
                  <label>Name</label>
                  <input
                    value={activeSuspect.name}
                    onChange={(e) => onSuspectChange(selectedSuspectId!, 'name', e.target.value)}
                  />
                </FlexInputGroup>
                {!isSupportChar && (
                  <NarrowInputGroup>
                    <label>Age</label>
                    <input
                      type="number"
                      value={(activeSuspect as Suspect).age}
                      onChange={(e) => onSuspectChange(selectedSuspectId!, 'age', parseInt(e.target.value))}
                    />
                  </NarrowInputGroup>
                )}
              </FlexRow>
              <InputGroup>
                <label>Role</label>
                <input
                  value={activeSuspect.role}
                  onChange={(e) => onSuspectChange(selectedSuspectId!, 'role', e.target.value)}
                />
              </InputGroup>
              {!isSupportChar && (
                <InputGroup>
                  <label>Status</label>
                  <input
                    value={(activeSuspect as Suspect).status || ''}
                    onChange={(e) => onSuspectChange(selectedSuspectId!, 'status', e.target.value)}
                    placeholder="e.g. Cooperative, Guarded, Tense, Hostile"
                  />
                </InputGroup>
              )}
              <InputGroup>
                <label>Gender</label>
                <input
                  value={activeSuspect.gender}
                  onChange={(e) => onSuspectChange(selectedSuspectId!, 'gender', e.target.value)}
                />
              </InputGroup>
              <InputGroup>
                <label>Personality</label>
                <textarea
                  value={activeSuspect.personality}
                  onChange={(e) => onSuspectChange(selectedSuspectId!, 'personality', e.target.value)}
                />
              </InputGroup>
              <InputGroup>
                <label>TTS Voice</label>
                <FlexRow>
                  <VoiceDropdown
                    value={activeSuspect.voice || 'None'}
                    onChange={(v) => onSuspectChange(selectedSuspectId!, 'voice', v)}
                  />
                  <AccentInput
                    type="text"
                    value={activeSuspect.voiceAccent || ''}
                    onChange={(e) => onSuspectChange(selectedSuspectId!, 'voiceAccent', e.target.value)}
                    placeholder="Accent..."
                  />
                  <PreviewButton
                    onClick={onPreviewVoice}
                    disabled={!activeSuspect.voice || activeSuspect.voice === 'None' || isPreviewingVoice}
                  >
                    {isPreviewingVoice ? '...' : 'Preview'}
                  </PreviewButton>
                </FlexRow>
              </InputGroup>
            </InputsCol>
          </SuspectEditorRow>

          {selectedSuspectId === 'partner' && (
            <InputGroup>
              <label>Partner Charges (per game)</label>
              <input
                type="number"
                min="1"
                max="10"
                value={draftCase.partnerCharges ?? 3}
                onChange={(e) => onCaseChange('partnerCharges', Math.max(1, Math.min(10, parseInt(e.target.value) || 3)))}
              />
            </InputGroup>
          )}

          {!isSupportChar && (
            <>
              <InputGroup>
                <label>Bio</label>
                <textarea
                  value={(activeSuspect as Suspect).bio}
                  onChange={(e) => onSuspectChange(activeSuspect.id, 'bio', e.target.value)}
                />
              </InputGroup>

              <InputGroup>
                <label>Motive</label>
                <textarea
                  value={(activeSuspect as Suspect).motive || ''}
                  onChange={(e) => onSuspectChange(activeSuspect.id, 'motive', e.target.value)}
                />
              </InputGroup>

              <InputGroup>
                <label>Professional Skills</label>
                <input
                  value={(activeSuspect as Suspect).professionalBackground || ''}
                  onChange={(e) => onSuspectChange(activeSuspect.id, 'professionalBackground', e.target.value)}
                />
              </InputGroup>

              <InputGroup>
                <label>Witness Observations</label>
                <textarea
                  value={(activeSuspect as Suspect).witnessObservations || ''}
                  onChange={(e) => onSuspectChange(activeSuspect.id, 'witnessObservations', e.target.value)}
                />
              </InputGroup>

              <Fieldset>
                <legend>Alibi</legend>
                <InputGroup>
                  <label>Story</label>
                  <textarea
                    value={(activeSuspect as Suspect).alibi?.statement || ''}
                    onChange={(e) => onSuspectChange(activeSuspect.id, 'alibi', { ...(activeSuspect as Suspect).alibi, statement: e.target.value })}
                  />
                </InputGroup>
                <AlibiRow>
                  <FlexInputGroup>
                    <label>Location</label>
                    <input
                      value={(activeSuspect as Suspect).alibi?.location || ''}
                      onChange={(e) => onSuspectChange(activeSuspect.id, 'alibi', { ...(activeSuspect as Suspect).alibi, location: e.target.value })}
                    />
                  </FlexInputGroup>
                  <AlibiToggle
                    $active={(activeSuspect as Suspect).alibi?.isTrue || false}
                    onClick={() => onSuspectChange(activeSuspect.id, 'alibi', { ...(activeSuspect as Suspect).alibi, isTrue: !(activeSuspect as Suspect).alibi?.isTrue })}
                    data-cursor="pointer"
                  >
                    {(activeSuspect as Suspect).alibi?.isTrue ? '✓' : <XIcon />} VERIFIED
                  </AlibiToggle>
                </AlibiRow>
              </Fieldset>

              {/* RELATIONSHIPS */}
              <Fieldset>
                <legend>Relationships</legend>
                <ModuleContainer>
                  {relationshipTargets.map(targetName => {
                    const rel = (activeSuspect as Suspect).relationships?.find(r => r.targetName === targetName) || { type: '', description: '' };
                    return (
                      <ModuleItem key={`${activeSuspect.id}-${targetName}`}>
                        <FlexRowAligned>
                          <RelTargetLabel>
                            {targetName === "The Victim" && deceasedSuspect
                              ? `The Victim (${deceasedSuspect.name})`
                              : targetName}
                          </RelTargetLabel>
                          <RelTypeInput
                            placeholder="Type (e.g. Rival)"
                            value={rel.type}
                            onChange={e => handleRelationshipChange(targetName, 'type', e.target.value)}
                          />
                        </FlexRowAligned>
                        <StyledTextArea
                          placeholder={`How does ${activeSuspect.name} feel about ${targetName}?`}
                          value={rel.description}
                          onChange={e => handleRelationshipChange(targetName, 'description', e.target.value)}
                        />
                      </ModuleItem>
                    );
                  })}
                </ModuleContainer>
              </Fieldset>

              {/* TIMELINE */}
              <Fieldset>
                <legend>Timeline ({(activeSuspect as Suspect)?.timeline?.length || 0})</legend>
                <ModuleContainer>
                  {(activeSuspect as Suspect)?.timeline?.map((t, i) => (
                    <TimelineModuleItem key={`${activeSuspect.id}-timeline-${i}`}>
                      <TimelineFlexCol>
                        <FlexRow>
                          <TimelineDayInput
                            placeholder="Day (e.g. Today, Yesterday)"
                            value={t.day || ''}
                            onChange={(e) => updateTimeline(i, 'day' as any, e.target.value)}
                          />
                          <TimelineOffsetInput
                            placeholder="Offset"
                            type="number"
                            value={t.dayOffset ?? 0}
                            onChange={(e) => {
                              if (!activeSuspect || isSupportChar) return;
                              const currentSuspect = activeSuspect as Suspect;
                              const newTime = [...currentSuspect.timeline];
                              newTime[i] = { ...newTime[i], dayOffset: parseInt(e.target.value) || 0 };
                              onSuspectChange(activeSuspect.id, 'timeline', newTime);
                            }}
                          />
                        </FlexRow>
                        <StyledInput
                          placeholder="Time (e.g. 8:00 PM)"
                          value={t.time}
                          onChange={(e) => updateTimeline(i, 'time', e.target.value)}
                        />
                        <StyledTextArea
                          placeholder="Activity"
                          value={t.activity}
                          onChange={(e) => updateTimeline(i, 'activity', e.target.value)}
                        />
                      </TimelineFlexCol>
                      <SideDeleteButton
                        onClick={() => removeTimelineEvent(i)}
                        title="Delete timeline event"
                      >
                        <XIcon />
                      </SideDeleteButton>
                    </TimelineModuleItem>
                  ))}
                  <AddButton onClick={addTimelineEvent}>+ ADD TIMELINE EVENT</AddButton>
                </ModuleContainer>
              </Fieldset>

              {/* KNOWN FACTS */}
              <Fieldset>
                <legend>Known Facts ({(activeSuspect as Suspect)?.knownFacts?.length || 0})</legend>
                <ModuleContainer>
                  {(activeSuspect as Suspect)?.knownFacts?.map((f, i) => (
                    <FactModuleItem key={`${activeSuspect.id}-fact-${i}`}>
                      <StyledTextArea
                        value={f}
                        onChange={(e) => updateFact(i, e.target.value)}
                      />
                      <SideDeleteButton
                        onClick={() => removeFact(i)}
                        title="Delete fact"
                      >
                        <XIcon />
                      </SideDeleteButton>
                    </FactModuleItem>
                  ))}
                  <AddButton onClick={addFact}>+ ADD FACT</AddButton>
                </ModuleContainer>
              </Fieldset>

              <InputGroup>
                <label>Secret (Red Herring or Motive)</label>
                <textarea
                  value={(activeSuspect as Suspect).secret}
                  onChange={(e) => onSuspectChange(activeSuspect.id, 'secret', e.target.value)}
                />
              </InputGroup>

              <EvidenceEditor
                label="Hidden Evidence (Revealed under pressure)"
                evidenceList={(activeSuspect as Suspect).hiddenEvidence}
                onChange={(newList) => onSuspectChange(activeSuspect.id, 'hiddenEvidence', newList)}
                onRerollImage={(ev) => onRerollEvidence(ev, 'hidden', activeSuspect.id)}
                ownerKey={activeSuspect.id}
                suspects={draftCase.suspects}
                onTransferEvidence={onTransferEvidence}
              />

              <InputGroup>
                <label>Base Aggravation (0-100)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={(activeSuspect as Suspect).baseAggravation}
                  onChange={(e) => onSuspectChange(activeSuspect.id, 'baseAggravation', parseInt(e.target.value))}
                />
              </InputGroup>
            </>
          )}

          <MobileOnly>
            <MobileButtonRow>
              <FlexSaveButton onClick={onSave} disabled={loadingVisible}>SAVE</FlexSaveButton>
              <FlexSaveButton onClick={onCheckConsistency} disabled={loadingVisible}>CHECK CONSISTENCY</FlexSaveButton>
              <CloseButton onClick={onCancel} disabled={loadingVisible}>CLOSE</CloseButton>
            </MobileButtonRow>
            <StartButton onClick={onStart}>CASE HUB</StartButton>
          </MobileOnly>

        </EditorSection>
      )}
    </Panel>
  );
};

export default SuspectEditorPanel;
