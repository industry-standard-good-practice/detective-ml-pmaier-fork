
import React from 'react';
import { type } from '../../theme';
import styled from 'styled-components';
import { CaseData, Emotion, Evidence, TimelineEvent } from '../../types';
import EvidenceEditor from '@/components/EvidenceEditor';

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, color: '#fff' }}>Case Details</h2>
        {draftCase.version && (
          <span style={{ color: '#555', fontSize: 'var(--type-small)', border: '1px solid #333', padding: '2px 8px' }}>
            VERSION {draftCase.version}
          </span>
        )}
      </div>

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
        <div style={{ display: 'flex', gap: 'var(--space)', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="e.g. 'September 12, 1924 at 11:30 PM' or '5 ABY, late evening'"
            value={draftCase.startTime || ''}
            onChange={(e) => onCaseChange('startTime', e.target.value)}
            style={{ flex: 1 }}
          />
          <input
            type="datetime-local"
            style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
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
          <button
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
            style={{
              background: '#222', border: '1px solid #444', color: '#888',
              padding: 0, cursor: 'pointer', fontSize: 'var(--type-body)',
              lineHeight: 1, flexShrink: 0, aspectRatio: '1',
              alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
            title="Open date picker"
          >
            📅
          </button>
        </div>
        <p style={{ fontSize: 'var(--type-small)', color: '#555', margin: '4px 0 0' }}>
          Any format works — real dates, fictional calendars (ABY, Stardates), or freeform text. Use 📅 for a date picker.
        </p>
      </InputGroup>

      <InputGroup>
        <label>Hero Image (Case Card)</label>
        <HeroImageModuleWrapper>
          <HeroImageModuleInner>
            <HeroImagePreview $imageUrl={draftCase.heroImageUrl || undefined}>
              {!draftCase.heroImageUrl && "NO IMAGE"}
            </HeroImagePreview>
            <HeroImageControls>
              <div style={{ display: 'flex', gap: 'var(--space)' }}>
                <SmallButton
                  $active={heroMode === 'suspect'}
                  onClick={() => setHeroMode('suspect')}
                  style={{ flex: 1, background: heroMode === 'suspect' ? '#3b82f6' : '#222' }}
                >
                  USE SUSPECT
                </SmallButton>
                <SmallButton
                  $active={heroMode === 'evidence'}
                  onClick={() => setHeroMode('evidence')}
                  style={{ flex: 1, background: heroMode === 'evidence' ? '#3b82f6' : '#222' }}
                >
                  USE EVIDENCE
                </SmallButton>
                <SmallButton
                  $active={heroMode === 'custom'}
                  onClick={() => setHeroMode('custom')}
                  style={{ flex: 1, background: heroMode === 'custom' ? '#3b82f6' : '#222' }}
                >
                  USE CUSTOM
                </SmallButton>
              </div>

              {heroMode === 'suspect' && (
                <select
                  style={{ backgroundColor: '#111', color: '#fff', border: '1px solid #444', padding: 'var(--space)', WebkitAppearance: 'none', appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23ffffff' d='M6 8L0 0h12z'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', backgroundSize: '10px', paddingRight: 'calc(var(--space) * 4)' }}
                  onChange={(e) => {
                    const s = draftCase.suspects?.find(x => x.id === e.target.value);
                    if (s?.portraits?.[Emotion.NEUTRAL]) onCaseChange('heroImageUrl', s.portraits[Emotion.NEUTRAL]);
                  }}
                  value={draftCase.suspects?.find(s => s.portraits?.[Emotion.NEUTRAL] === draftCase.heroImageUrl)?.id || ''}
                >
                  <option value="">Select a suspect...</option>
                  {(draftCase.suspects || []).map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                  ))}
                </select>
              )}

              {heroMode === 'evidence' && (
                <select
                  style={{ backgroundColor: '#111', color: '#fff', border: '1px solid #444', padding: 'var(--space)', WebkitAppearance: 'none', appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23ffffff' d='M6 8L0 0h12z'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', backgroundSize: '10px', paddingRight: 'calc(var(--space) * 4)' }}
                  onChange={(e) => {
                    const ev = [...draftCase.initialEvidence, ...(draftCase.suspects?.flatMap(s => s.hiddenEvidence || []) || [])].find(x => x.id === e.target.value);
                    if (ev?.imageUrl) onCaseChange('heroImageUrl', ev.imageUrl);
                  }}
                  value={[...draftCase.initialEvidence, ...(draftCase.suspects?.flatMap(s => s.hiddenEvidence || []) || [])].find(ev => ev.imageUrl === draftCase.heroImageUrl)?.id || ''}
                >
                  <option value="">Select evidence...</option>
                  {[...(draftCase.initialEvidence || []), ...(draftCase.suspects?.flatMap(s => s.hiddenEvidence || []) || [])].map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.title}</option>
                  ))}
                </select>
              )}

              {heroMode === 'custom' && (
                <div style={{ display: 'flex', gap: 'var(--space)' }}>
                  <SmallButton onClick={() => onShowHeroEditor()} style={{ flex: 1 }}>
                    GENERATE CUSTOM
                  </SmallButton>
                  <SmallButton onClick={() => {
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
                  }} style={{ flex: 1 }}>
                    UPLOAD IMAGE
                  </SmallButton>
                  <SmallButton onClick={() => onPasteFromClipboard((base64) => onCaseChange('heroImageUrl', base64))} style={{ flex: 1 }}>
                    PASTE
                  </SmallButton>
                </div>
              )}

              <input
                placeholder="Or paste image URL here..."
                value={draftCase.heroImageUrl || ''}
                onChange={(e) => onCaseChange('heroImageUrl', e.target.value)}
                style={{ fontSize: 'var(--type-xs)', padding: 'var(--space)', background: '#111', border: '1px solid #333', color: '#888', width: '100%', minWidth: 0, boxSizing: 'border-box' }}
              />
            </HeroImageControls>
          </HeroImageModuleInner>
        </HeroImageModuleWrapper>
      </InputGroup>

      <InputGroup>
        <label>Edit case</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space)', background: 'rgba(0,255,0,0.03)', padding: 'calc(var(--space) * 2)', border: '1px solid rgba(0,255,0,0.1)' }}>
          <textarea
            placeholder="e.g. 'Change the setting to a futuristic space station' or 'Add a secret accomplice for the killer' or 'Make the victim a famous opera singer'..."
            value={editPrompt}
            onChange={(e) => setEditPrompt(e.target.value)}
            style={{ minHeight: '100px' }}
          />
          <StartButton
            onClick={onEditCase}
            disabled={loadingVisible || !editPrompt.trim()}
            style={{ fontSize: 'var(--type-body)', padding: 'var(--space)' }}
          >
            APPLY EDITS
          </StartButton>
          <p style={{ fontSize: 'var(--type-xs)', color: '#555', margin: 0 }}>
            This will transform suspects, evidence, and narrative to match your request.
          </p>
        </div>
      </InputGroup>

      <InputGroup>
        <label>Difficulty (Calculated)</label>
        <div style={{
          color: draftCase.difficulty === 'Hard' ? '#f55' : draftCase.difficulty === 'Medium' ? '#fa0' : '#0f0',
          fontWeight: 'bold',
          textTransform: 'uppercase',
          fontSize: 'var(--type-h3)',
          padding: '5px 0'
        }}>
          {draftCase.difficulty}
        </div>
        <p style={{ fontSize: 'var(--type-small)', color: '#555', margin: 0 }}>
          Based on {draftCase.suspects?.filter(s => !s.isDeceased).length || 0} suspects, {draftCase.suspects?.filter(s => s.isDeceased).length || 0} victim(s), {draftCase.suspects?.filter(s => s.isGuilty).length || 0} guilty suspect(s), {(draftCase.initialEvidence?.length || 0) + (draftCase.suspects?.reduce((a, s) => a + (s.hiddenEvidence?.length || 0), 0) || 0)} total evidence items, and {draftCase.initialTimeline?.length || 0} initial timeline events.
        </p>
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
            <ModuleItem key={`initial-timeline-${idx}`} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space)' }}>
                <div style={{ display: 'flex', gap: 'var(--space)' }}>
                  <StyledInput
                    placeholder="Day (e.g. Today, Yesterday)"
                    value={event.day || ''}
                    onChange={(e) => {
                      const newList = [...(draftCase.initialTimeline || [])];
                      newList[idx] = { ...newList[idx], day: e.target.value };
                      onCaseChange('initialTimeline', newList);
                    }}
                    style={{ flex: 2 }}
                  />
                  <StyledInput
                    placeholder="Offset"
                    type="number"
                    value={event.dayOffset ?? 0}
                    onChange={(e) => {
                      const newList = [...(draftCase.initialTimeline || [])];
                      newList[idx] = { ...newList[idx], dayOffset: parseInt(e.target.value) || 0 };
                      onCaseChange('initialTimeline', newList);
                    }}
                    style={{ flex: 0, width: '70px' }}
                  />
                </div>
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
              </div>
              <DeleteButton
                onClick={() => {
                  const newList = (draftCase.initialTimeline || []).filter((_, i) => i !== idx);
                  onCaseChange('initialTimeline', newList);
                }}
                style={{ marginLeft: 'var(--space)', alignSelf: 'stretch' }}
                title="Delete timeline event"
              >
                <XIcon />
              </DeleteButton>
            </ModuleItem>
          ))}
          <SmallButton onClick={() => {
            const newList = [...(draftCase.initialTimeline || []), { time: '', activity: '', day: 'Today', dayOffset: 0 }];
            onCaseChange('initialTimeline', newList);
          }} style={{ padding: 'var(--space)', background: '#222' }}>+ ADD TIMELINE EVENT</SmallButton>
        </ModuleContainer>
      </Fieldset>

      <MobileOnly>
        <div style={{ display: 'flex', gap: 'var(--space)', width: '100%' }}>
          <SaveButton onClick={onCancel} disabled={loadingVisible} style={{ flex: 1, background: '#444', color: '#fff', border: 'none' }}>CLOSE</SaveButton>
          <SaveButton onClick={onCheckConsistency} disabled={loadingVisible} style={{ flex: 1 }}>CHECK CONSISTENCY</SaveButton>
          <SaveButton onClick={onSave} disabled={loadingVisible} style={{ flex: 1 }}>SAVE</SaveButton>
        </div>
        <StartButton onClick={onStart}>CASE HUB</StartButton>
      </MobileOnly>
    </Panel>
  );
};

export default CaseDetailsPanel;
