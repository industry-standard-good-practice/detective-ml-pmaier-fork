
import React from 'react';
import { type } from '../../theme';
import styled from 'styled-components';
import { CaseData, Emotion, Evidence, TimelineEvent } from '../../types';
import EvidenceEditor from '@/components/EvidenceEditor';
import { Dropdown } from '@/components/ui';

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

    &::-webkit-calendar-picker-indicator {
      filter: invert(0.85);
    }
  }

  select {
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23ffffff' d='M6 8L0 0h12z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    background-size: 10px;
    padding-right: calc(var(--space) * 4);
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

const HeroImageModuleWrapper = styled.div`
  container-type: inline-size;
  margin-bottom: var(--space);
`;

const HeroImageModuleInner = styled.div`
  display: flex;
  gap: calc(var(--space) * 2);
  align-items: stretch;
  background: rgba(255,255,255,0.03);
  padding: calc(var(--space) * 2);
  border: 1px solid rgba(255,255,255,0.05);

  @container (max-width: 450px) {
    flex-direction: column;
  }
`;

const HeroImagePreview = styled.div<{ $imageUrl?: string }>`
  width: 50%;
  aspect-ratio: 1 / 1;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  background-image: ${props => props.$imageUrl ? `url(${props.$imageUrl})` : 'none'};
  background-size: cover;
  background-position: center;
  image-rendering: pixelated;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-border);
  ${type.xs}
  overflow: hidden;

  @container (max-width: 450px) {
    width: 100%;
    max-height: 280px;
  }
`;

const HeroImageControls = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: calc(var(--space) * 2);

  @container (max-width: 450px) {
    width: 100%;
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

const VersionBadge = styled.span`
  color: #555;
  font-size: var(--type-small);
  border: 1px solid #333;
  padding: 2px 8px;
`;

const FlexRow = styled.div`
  display: flex;
  gap: var(--space);
`;

const FlexRowAligned = styled(FlexRow)`
  align-items: center;
`;

const FlexInput = styled.input`
  flex: 1;
`;

const HiddenDatePicker = styled.input`
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
`;

const DatePickerButton = styled.button`
  background: #222;
  border: 1px solid #444;
  color: #888;
  padding: 0;
  cursor: pointer;
  font-size: var(--type-body);
  line-height: 1;
  flex-shrink: 0;
  aspect-ratio: 1;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const HintText = styled.p`
  font-size: var(--type-small);
  color: #555;
  margin: 4px 0 0;
`;

const HeroModeButton = styled(SmallButton)`
  flex: 1;
`;

const FlexSmallButton = styled(SmallButton)`
  flex: 1;
`;

const HeroUrlInput = styled.input`
  font-size: var(--type-xs);
  padding: var(--space);
  background: #111;
  border: 1px solid #333;
  color: #888;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
`;

const EditCaseBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space);
  background: rgba(0,255,0,0.03);
  padding: calc(var(--space) * 2);
  border: 1px solid rgba(0,255,0,0.1);
`;

const EditPromptTextArea = styled.textarea`
  min-height: 100px;
`;

const ApplyEditsButton = styled(StartButton)`
  font-size: var(--type-body);
  padding: var(--space);
`;

const EditHintText = styled.p`
  font-size: var(--type-xs);
  color: #555;
  margin: 0;
`;

const DifficultyLabel = styled.div<{ $difficulty: string }>`
  color: ${props => props.$difficulty === 'Hard' ? '#f55' : props.$difficulty === 'Medium' ? '#fa0' : '#0f0'};
  font-weight: bold;
  text-transform: uppercase;
  font-size: var(--type-h3);
  padding: 5px 0;
`;

const DifficultyHint = styled.p`
  font-size: var(--type-small);
  color: #555;
  margin: 0;
`;

const TimelineModuleItem = styled(ModuleItem)`
  flex-direction: row;
  align-items: center;
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

const MobileCloseButton = styled(FlexSaveButton)`
  background: #444;
  color: #fff;
  border: none;
`;

// --- Props ---

interface CaseDetailsPanelProps {
  draftCase: CaseData;
  mobileTab: 'case' | 'suspects';
  heroMode: 'suspect' | 'evidence' | 'custom';
  setHeroMode: (mode: 'suspect' | 'evidence' | 'custom') => void;
  editPrompt: string;
  setEditPrompt: (val: string) => void;
  loadingVisible: boolean;
  onCaseChange: (field: keyof CaseData, value: any) => void;
  onRerollEvidence: (ev: Evidence, source: 'initial' | 'hidden', suspectId?: string) => void;
  onTransferEvidence: (evidence: Evidence, fromOwner: string, toOwner: string) => void;
  onEditCase: () => void;
  onShowHeroEditor: () => void;
  onPasteFromClipboard: (callback: (base64: string) => void) => void;
  onSave: () => void;
  onCheckConsistency: () => void;
  onCancel: () => void;
  onStart: () => void;
}

const CaseDetailsPanel: React.FC<CaseDetailsPanelProps> = ({
  draftCase,
  mobileTab,
  heroMode,
  setHeroMode,
  editPrompt,
  setEditPrompt,
  loadingVisible,
  onCaseChange,
  onRerollEvidence,
  onTransferEvidence,
  onEditCase,
  onShowHeroEditor,
  onPasteFromClipboard,
  onSave,
  onCheckConsistency,
  onCancel,
  onStart,
}) => {
  return (
    <Panel $mobileHidden={mobileTab !== 'case'}>
      <PanelHeader>
        <PanelTitle>Case Details</PanelTitle>
        {draftCase.version && (
          <VersionBadge>
            VERSION {draftCase.version}
          </VersionBadge>
        )}
      </PanelHeader>

      <InputGroup>
        <label>Case Title</label>
        <input
          value={draftCase.title || ''}
          onChange={(e) => onCaseChange('title', e.target.value)}
        />
      </InputGroup>

      <InputGroup>
        <label>Crime Type</label>
        <input
          value={draftCase.type || ''}
          onChange={(e) => onCaseChange('type', e.target.value)}
        />
      </InputGroup>

      <InputGroup>
        <label>Briefing / Description</label>
        <textarea
          value={draftCase.description || ''}
          onChange={(e) => onCaseChange('description', e.target.value)}
        />
      </InputGroup>

      <InputGroup>
        <label>Investigation Start Time</label>
        <FlexRowAligned>
          <FlexInput
            type="text"
            placeholder="e.g. 'September 12, 1924 at 11:30 PM' or '5 ABY, late evening'"
            value={draftCase.startTime || ''}
            onChange={(e) => onCaseChange('startTime', e.target.value)}
          />
          <HiddenDatePicker
            type="datetime-local"
            id="startTimePicker"
            onChange={(e) => {
              if (!e.target.value) return;
              if (e.target.value === e.target.dataset.prevValue) return;
              const d = new Date(e.target.value);
              if (isNaN(d.getTime())) return;
              const formatted = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                + ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
              onCaseChange('startTime', formatted);
            }}
          />
          <DatePickerButton
            type="button"
            onClick={() => {
              const picker = document.getElementById('startTimePicker') as HTMLInputElement;
              if (picker) {
                const raw = draftCase.startTime || '';
                if (raw) {
                  const toLocal = (d: Date) => {
                    const y = d.getFullYear();
                    const mo = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    const h = String(d.getHours()).padStart(2, '0');
                    const mi = String(d.getMinutes()).padStart(2, '0');
                    return `${y}-${mo}-${day}T${h}:${mi}`;
                  };

                  let parsed: Date | null = null;
                  const direct = new Date(raw);
                  if (!isNaN(direct.getTime()) && direct.getFullYear() > 0) parsed = direct;

                  if (!parsed) {
                    const stripped = raw.replace(/\bat\b/gi, '').replace(/\s+/g, ' ').trim();
                    const d2 = new Date(stripped);
                    if (!isNaN(d2.getTime()) && d2.getFullYear() > 0) parsed = d2;
                  }

                  if (!parsed) {
                    const datePatterns = [
                      /(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{1,4}/i,
                      /\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,4}/i,
                      /\d{4}-\d{2}-\d{2}/,
                      /\d{1,2}\/\d{1,2}\/\d{2,4}/,
                    ];
                    const timePatterns = [
                      /(\d{1,2}:\d{2}\s*(?:AM|PM))/i,
                      /(\d{1,2}:\d{2})/,
                    ];
                    let dateStr = '';
                    let timeStr = '';
                    for (const pattern of datePatterns) {
                      const match = raw.match(pattern);
                      if (match) { dateStr = match[0]; break; }
                    }
                    for (const pattern of timePatterns) {
                      const match = raw.match(pattern);
                      if (match) { timeStr = match[1] || match[0]; break; }
                    }
                    if (dateStr) {
                      const combined = timeStr ? `${dateStr} ${timeStr}` : dateStr;
                      const d3 = new Date(combined);
                      if (!isNaN(d3.getTime()) && d3.getFullYear() > 0) parsed = d3;
                    }
                  }

                  if (!parsed) {
                    const timeOnly = raw.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
                    if (timeOnly) {
                      const now = new Date();
                      let h = parseInt(timeOnly[1]);
                      const m = parseInt(timeOnly[2]);
                      const meridiem = timeOnly[3];
                      if (meridiem) {
                        if (meridiem.toUpperCase() === 'PM' && h < 12) h += 12;
                        if (meridiem.toUpperCase() === 'AM' && h === 12) h = 0;
                      }
                      now.setHours(h, m, 0, 0);
                      parsed = now;
                    }
                  }

                  if (parsed) picker.value = toLocal(parsed);
                }
                picker.dataset.prevValue = picker.value;
                picker.showPicker?.();
              }
            }}
            title="Open date picker"
          >
            📅
          </DatePickerButton>
        </FlexRowAligned>
        <HintText>
          Any format works — real dates, fictional calendars (ABY, Stardates), or freeform text. Use 📅 for a date picker.
        </HintText>
      </InputGroup>

      <InputGroup>
        <label>Hero Image (Case Card)</label>
        <HeroImageModuleWrapper>
          <HeroImageModuleInner>
            <HeroImagePreview $imageUrl={draftCase.heroImageUrl || undefined}>
              {!draftCase.heroImageUrl && "NO IMAGE"}
            </HeroImagePreview>
            <HeroImageControls>
              <FlexRow>
                <HeroModeButton
                  $active={heroMode === 'suspect'}
                  onClick={() => setHeroMode('suspect')}
                >
                  USE SUSPECT
                </HeroModeButton>
                <HeroModeButton
                  $active={heroMode === 'evidence'}
                  onClick={() => setHeroMode('evidence')}
                >
                  USE EVIDENCE
                </HeroModeButton>
                <HeroModeButton
                  $active={heroMode === 'custom'}
                  onClick={() => setHeroMode('custom')}
                >
                  USE CUSTOM
                </HeroModeButton>
              </FlexRow>

              {heroMode === 'suspect' && (
                <Dropdown
                  options={(draftCase.suspects || []).map(s => ({
                    value: s.portraits?.[Emotion.NEUTRAL] || s.id,
                    label: `${s.name} (${s.role})`,
                  }))}
                  value={draftCase.heroImageUrl || ''}
                  onChange={(url) => onCaseChange('heroImageUrl', url)}
                  placeholder="Select a suspect..."
                />
              )}

              {heroMode === 'evidence' && (
                <Dropdown
                  options={[
                    ...(draftCase.initialEvidence || []),
                    ...(draftCase.suspects?.flatMap(s => s.hiddenEvidence || []) || [])
                  ].map(ev => ({
                    value: ev.imageUrl || ev.id,
                    label: ev.title,
                  }))}
                  value={draftCase.heroImageUrl || ''}
                  onChange={(url) => onCaseChange('heroImageUrl', url)}
                  placeholder="Select evidence..."
                />
              )}

              {heroMode === 'custom' && (
                <FlexRow>
                  <FlexSmallButton onClick={() => onShowHeroEditor()}>
                    GENERATE CUSTOM
                  </FlexSmallButton>
                  <FlexSmallButton onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = (e: any) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => onCaseChange('heroImageUrl', ev.target?.result as string);
                      reader.readAsDataURL(file);
                    };
                    input.click();
                  }}>
                    UPLOAD IMAGE
                  </FlexSmallButton>
                  <FlexSmallButton onClick={() => onPasteFromClipboard((base64) => onCaseChange('heroImageUrl', base64))}>
                    PASTE
                  </FlexSmallButton>
                </FlexRow>
              )}

              <HeroUrlInput
                placeholder="Or paste image URL here..."
                value={draftCase.heroImageUrl || ''}
                onChange={(e) => onCaseChange('heroImageUrl', e.target.value)}
              />
            </HeroImageControls>
          </HeroImageModuleInner>
        </HeroImageModuleWrapper>
      </InputGroup>

      <InputGroup>
        <label>Edit case</label>
        <EditCaseBox>
          <EditPromptTextArea
            placeholder="e.g. 'Change the setting to a futuristic space station' or 'Add a secret accomplice for the killer' or 'Make the victim a famous opera singer'..."
            value={editPrompt}
            onChange={(e) => setEditPrompt(e.target.value)}
          />
          <ApplyEditsButton
            onClick={onEditCase}
            disabled={loadingVisible || !editPrompt.trim()}
          >
            APPLY EDITS
          </ApplyEditsButton>
          <EditHintText>
            This will transform suspects, evidence, and narrative to match your request.
          </EditHintText>
        </EditCaseBox>
      </InputGroup>

      <InputGroup>
        <label>Difficulty (Calculated)</label>
        <DifficultyLabel $difficulty={draftCase.difficulty}>
          {draftCase.difficulty}
        </DifficultyLabel>
        <DifficultyHint>
          Based on {draftCase.suspects?.filter(s => !s.isDeceased).length || 0} suspects, {draftCase.suspects?.filter(s => s.isDeceased).length || 0} victim(s), {draftCase.suspects?.filter(s => s.isGuilty).length || 0} guilty suspect(s), {(draftCase.initialEvidence?.length || 0) + (draftCase.suspects?.reduce((a, s) => a + (s.hiddenEvidence?.length || 0), 0) || 0)} total evidence items, and {draftCase.initialTimeline?.length || 0} initial timeline events.
        </DifficultyHint>
      </InputGroup>

      <EvidenceEditor
        label="Initial Evidence"
        evidenceList={draftCase.initialEvidence}
        onChange={(newList) => onCaseChange('initialEvidence', newList)}
        onRerollImage={(ev) => onRerollEvidence(ev, 'initial')}
        ownerKey="initial"
        suspects={draftCase.suspects}
        onTransferEvidence={onTransferEvidence}
      />

      <Fieldset>
        <legend>Initial Timeline (Known Facts)</legend>
        <ModuleContainer>
          {(draftCase.initialTimeline || []).map((event, idx) => (
            <TimelineModuleItem key={`initial-timeline-${idx}`}>
              <TimelineFlexCol>
                <FlexRow>
                  <TimelineDayInput
                    placeholder="Day (e.g. Today, Yesterday)"
                    value={event.day || ''}
                    onChange={(e) => {
                      const newList = [...(draftCase.initialTimeline || [])];
                      newList[idx] = { ...newList[idx], day: e.target.value };
                      onCaseChange('initialTimeline', newList);
                    }}
                  />
                  <TimelineOffsetInput
                    placeholder="Offset"
                    type="number"
                    value={event.dayOffset ?? 0}
                    onChange={(e) => {
                      const newList = [...(draftCase.initialTimeline || [])];
                      newList[idx] = { ...newList[idx], dayOffset: parseInt(e.target.value) || 0 };
                      onCaseChange('initialTimeline', newList);
                    }}
                  />
                </FlexRow>
                <StyledInput
                  placeholder="Time (e.g. 10:00 PM)"
                  value={event.time}
                  onChange={(e) => {
                    const newList = [...(draftCase.initialTimeline || [])];
                    newList[idx] = { ...newList[idx], time: e.target.value };
                    onCaseChange('initialTimeline', newList);
                  }}
                />
                <StyledTextArea
                  placeholder="Activity/Discovery"
                  value={event.activity || (event as any).statement || ''}
                  onChange={(e) => {
                    const newList = [...(draftCase.initialTimeline || [])];
                    newList[idx] = { ...newList[idx], activity: e.target.value };
                    onCaseChange('initialTimeline', newList);
                  }}
                />
              </TimelineFlexCol>
              <SideDeleteButton
                onClick={() => {
                  const newList = (draftCase.initialTimeline || []).filter((_, i) => i !== idx);
                  onCaseChange('initialTimeline', newList);
                }}
                title="Delete timeline event"
              >
                <XIcon />
              </SideDeleteButton>
            </TimelineModuleItem>
          ))}
          <AddButton onClick={() => {
            const newList = [...(draftCase.initialTimeline || []), { time: '', activity: '', day: 'Today', dayOffset: 0 }];
            onCaseChange('initialTimeline', newList);
          }}>+ ADD TIMELINE EVENT</AddButton>
        </ModuleContainer>
      </Fieldset>

      <MobileOnly>
        <MobileButtonRow>
          <MobileCloseButton onClick={onCancel} disabled={loadingVisible}>CLOSE</MobileCloseButton>
          <FlexSaveButton onClick={onCheckConsistency} disabled={loadingVisible}>CHECK CONSISTENCY</FlexSaveButton>
          <FlexSaveButton onClick={onSave} disabled={loadingVisible}>SAVE</FlexSaveButton>
        </MobileButtonRow>
        <StartButton onClick={onStart}>CASE HUB</StartButton>
      </MobileOnly>
    </Panel>
  );
};

export default CaseDetailsPanel;
