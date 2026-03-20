
import React from 'react';
import styled from 'styled-components';
import { type } from '../../../theme';
import { Evidence, TimelineStatement } from '../../../types';

// --- Styled Components ---

const EvidenceMenu = styled.div`
  position: absolute;
  bottom: 110%;
  left: 0;
  background: var(--color-surface-inset);
  border: 1px solid #555;
  width: 280px;
  max-height: 300px;
  overflow-y: auto;
  z-index: 50;
  box-shadow: 0 0 20px #000;
  display: flex;
  flex-direction: column;

  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-thumb { background: var(--color-border); }
`;

const PlusButtonWrapper = styled.div`
  position: relative;
  height: 100%;
`;

const PlusButton = styled.button<{ $active: boolean }>`
  background: transparent;
  border: none;
  color: ${props => props.$active ? 'var(--color-text-bright)' : 'var(--color-border)'};
  width: 40px;
  height: 100%;
  ${type.h2}
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  
  &:hover {
    color: var(--color-text-bright);
    text-shadow: 0 0 5px var(--color-text-bright);
  }
`;

const EvidenceOption = styled.button`
  background: transparent;
  color: #ccc;
  border: none;
  padding: var(--space) calc(var(--space) * 2);
  text-align: left;
  font-family: inherit;
  ${type.body}
  cursor: pointer;
  border-bottom: 1px solid var(--color-border-subtle);
  display: flex;
  flex-direction: column;
  gap: var(--space);
  
  &:hover {
    background: var(--color-border-subtle);
    color: var(--color-text-bright);
  }
`;

const TimelineEvidenceOption = styled.button`
  background: var(--color-officer-button);
  color: var(--color-text-bright);
  border: 1px solid var(--color-officer-border);
  padding: calc(var(--space) * 2);
  margin: var(--space) var(--space);
  text-align: left;
  font-family: inherit;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: var(--space);
  box-shadow: 0 4px 10px rgba(0,0,0,0.3);
  transition: transform 0.1s, background 0.2s;
  
  &:hover {
    background: #2c3e50;
    transform: translateY(-2px);
  }

  .header {
    display: flex;
    align-items: center;
    gap: var(--space);
    border-bottom: 1px solid rgba(65, 90, 119, 0.5);
    padding-bottom: var(--space);
    margin-bottom: var(--space);
  }

  .time {
    font-family: 'VT323', monospace;
    color: var(--color-accent-green);
    ${type.bodyLg}
  }

  .suspect {
    ${type.xs}
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .statement {
    ${type.body}
    color: var(--color-text);
    line-height: 1.3;
    font-style: italic;
  }
`;

const TimelineDayHeader = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space);
  padding: 8px 12px 4px;
  margin-top: var(--space);
  
  &::before, &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--color-accent-green);
    opacity: 0.25;
  }
  
  span {
    font-family: 'VT323', monospace;
    color: var(--color-accent-green);
    ${type.small}
    letter-spacing: 2px;
    text-transform: uppercase;
    white-space: nowrap;
    text-shadow: 0 0 6px rgba(0, 255, 0, 0.2);
  }
`;

// --- Timeline grouping helper ---

const parseTimeToMinutes = (t: string): number => {
  const m12 = t.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (m12) {
    let h = parseInt(m12[1]);
    const m = parseInt(m12[2]);
    const pm = m12[3].toLowerCase() === 'pm';
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
    return h * 60 + m;
  }
  const m24 = t.trim().match(/^(\d{1,2}):(\d{2})/);
  if (m24) return parseInt(m24[1]) * 60 + parseInt(m24[2]);
  return -1;
};

// --- Evidence Picker Content (shared between desktop & mobile) ---

const EvidencePickerContent: React.FC<{
  evidenceDiscovered: Evidence[];
  timelineStatementsDiscovered: TimelineStatement[];
  isEvidenceSelected: (item: Evidence | TimelineStatement) => boolean;
  toggleEvidence: (item: Evidence | TimelineStatement) => void;
}> = ({ evidenceDiscovered, timelineStatementsDiscovered, isEvidenceSelected, toggleEvidence }) => {
  if (evidenceDiscovered.length === 0 && timelineStatementsDiscovered.length === 0) {
    return <div style={{ padding: 'var(--space)', color: '#555' }}>No evidence found yet.</div>;
  }

  const renderTimelineGroups = () => {
    const sorted = [...timelineStatementsDiscovered].sort((a, b) => {
      if (a.dayOffset !== b.dayOffset) return a.dayOffset - b.dayOffset;
      return parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time);
    });
    const dayGroups: { day: string; dayOffset: number; items: typeof sorted }[] = [];
    sorted.forEach(ts => {
      const last = dayGroups[dayGroups.length - 1];
      if (last && last.dayOffset === ts.dayOffset) { last.items.push(ts); }
      else { dayGroups.push({ day: ts.day || 'Today', dayOffset: ts.dayOffset, items: [ts] }); }
    });
    const showDayHeaders = dayGroups.length > 1 || (dayGroups.length === 1 && dayGroups[0].day !== 'Today');
    return dayGroups.map(group => (
      <React.Fragment key={`day-${group.dayOffset}`}>
        {showDayHeaders && (
          <TimelineDayHeader>
            <span>{group.day}</span>
          </TimelineDayHeader>
        )}
        {group.items.map(ts => {
          const selected = isEvidenceSelected(ts);
          return (
            <TimelineEvidenceOption
              key={ts.id}
              onClick={() => toggleEvidence(ts)}
              style={selected ? { background: '#1a2e3e', borderColor: '#0ff' } : undefined}
            >
              <div className="header">
                {selected && <span style={{ color: '#0ff', fontWeight: 'bold' }}>✓</span>}
                <span className="time">{ts.time}</span>
                <span className="suspect">BY {ts.suspectName}</span>
              </div>
              <div className="statement">"{ts.statement}"</div>
            </TimelineEvidenceOption>
          );
        })}
      </React.Fragment>
    ));
  };

  return (
    <>
      {evidenceDiscovered.length > 0 && (
        <>
          <div style={{ padding: '5px 10px', fontSize: 'var(--type-xs)', color: '#555', borderBottom: '1px solid #222', textTransform: 'uppercase' }}>Physical Evidence</div>
          {[...evidenceDiscovered].reverse().map((ev) => {
            const selected = isEvidenceSelected(ev);
            return (
              <EvidenceOption
                key={ev.id}
                onClick={() => toggleEvidence(ev)}
                style={selected ? { background: '#1a2a1a', borderColor: '#0f0' } : undefined}
              >
                <div style={{ fontWeight: 'bold', color: selected ? '#0f0' : '#fff', display: 'flex', alignItems: 'center', gap: 'var(--space)' }}>
                  {selected && <span>✓</span>}{ev.title}
                </div>
                <div style={{ fontSize: 'var(--type-small)', color: '#888', lineHeight: '1.2' }}>{ev.description}</div>
              </EvidenceOption>
            );
          })}
        </>
      )}
      {timelineStatementsDiscovered.length > 0 && (
        <>
          <div style={{ padding: '8px 12px', fontSize: 'var(--type-xs)', color: '#555', borderBottom: '1px solid #222', textTransform: 'uppercase', marginTop: 'var(--space)', letterSpacing: '1px' }}>Timeline Statements</div>
          {renderTimelineGroups()}
        </>
      )}
    </>
  );
};

// --- Main EvidencePicker Component (button + popup) ---

interface EvidencePickerProps {
  evidenceDiscovered: Evidence[];
  timelineStatementsDiscovered: TimelineStatement[];
  selectedEvidence: (Evidence | TimelineStatement)[];
  isLocked: boolean;
  showEvidencePicker: boolean;
  setShowEvidencePicker: (show: boolean) => void;
  isEvidenceSelected: (item: Evidence | TimelineStatement) => boolean;
  toggleEvidence: (item: Evidence | TimelineStatement) => void;
  menuRef: React.RefObject<HTMLDivElement>;
}

const EvidencePicker: React.FC<EvidencePickerProps> = ({
  evidenceDiscovered,
  timelineStatementsDiscovered,
  selectedEvidence,
  isLocked,
  showEvidencePicker,
  setShowEvidencePicker,
  isEvidenceSelected,
  toggleEvidence,
  menuRef,
}) => (
  <PlusButtonWrapper ref={menuRef}>
    <PlusButton
      onClick={() => setShowEvidencePicker(!showEvidencePicker)}
      $active={selectedEvidence.length > 0}
      disabled={isLocked}
      title="Present Evidence"
    >
      +
    </PlusButton>
    {showEvidencePicker && (
      <EvidenceMenu>
        <EvidencePickerContent
          evidenceDiscovered={evidenceDiscovered}
          timelineStatementsDiscovered={timelineStatementsDiscovered}
          isEvidenceSelected={isEvidenceSelected}
          toggleEvidence={toggleEvidence}
        />
      </EvidenceMenu>
    )}
  </PlusButtonWrapper>
);

export default EvidencePicker;
