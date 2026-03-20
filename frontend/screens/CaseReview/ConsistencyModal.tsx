
import React from 'react';
import { type } from '../../theme';
import styled from 'styled-components';
import Markdown from 'react-markdown';
import { CaseData } from '../../types';

// --- Styled Components ---

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

  &:hover {
    background: #006600;
    color: var(--color-text-bright);
  }
  
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

// --- Props ---

interface ConsistencyModalProps {
  report: any;
  editReport?: any;
  editPrompt?: string;
  updatedCase: CaseData | null;
  draftCase: CaseData;
  onApply: () => void;
  onDiscard: () => void;
}

const ConsistencyModal: React.FC<ConsistencyModalProps> = ({
  report,
  editReport,
  editPrompt,
  updatedCase,
  draftCase,
  onApply,
  onDiscard,
}) => {
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      padding: '30px 20px',
    }}>
      <div style={{
        background: '#111',
        border: '1px solid #444',
        maxWidth: '800px',
        width: '95%',
        maxHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 0 50px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}>
        <h2 style={{
          color: '#fff', marginTop: 0, marginBottom: 0,
          borderBottom: '1px solid #333', padding: '20px 25px',
          fontSize: 'var(--type-h3)', flexShrink: 0,
          background: '#111', position: 'relative', zIndex: 1,
        }}>{editReport ? 'Case Transformation Report' : 'Narrative Audit Report'}</h2>

        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 25px',
          minHeight: 0,
        }}>
          {/* === EDIT-TRIGGERED MODAL: Show edit changes as primary content === */}
          {editReport && typeof editReport === 'object' ? (
            <>
              {/* User's original request */}
              <section style={{ marginBottom: 'calc(var(--space) * 3)' }}>
                <h3 style={{ color: '#3b82f6', fontSize: 'var(--type-body-lg)', marginBottom: 'var(--space)', textTransform: 'uppercase', letterSpacing: '1px' }}>Your Request</h3>
                <div style={{
                  background: 'rgba(59,130,246,0.08)',
                  border: '1px solid rgba(59,130,246,0.2)',
                  padding: 'calc(var(--space) * 2)',
                  color: '#ccc',
                  fontSize: 'var(--type-body)',
                  fontStyle: 'italic',
                  lineHeight: '1.5'
                }}>
                  "{editPrompt}"
                </div>
              </section>

              {/* Changes made by the edit */}
              <section style={{ marginBottom: 'calc(var(--space) * 3)' }}>
                <h3 style={{ color: '#0f0', fontSize: 'var(--type-body-lg)', marginBottom: 'calc(var(--space) * 2)', textTransform: 'uppercase', letterSpacing: '1px' }}>Changes Applied</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--space) * 2)' }}>
                  {(editReport.changesMade || []).map((change: any, idx: number) => {
                    const evidence = change.evidenceId ?
                      [...(updatedCase?.initialEvidence || []), ...(updatedCase?.suspects || []).flatMap(s => s.hiddenEvidence || [])]
                        .find(e => e.id === change.evidenceId) : null;

                    const isNewEvidence = evidence &&
                      !(draftCase.initialEvidence || []).find(e => e.id === evidence.id) &&
                      !(draftCase.suspects || []).flatMap(s => s.hiddenEvidence || []).find(e => e.id === evidence.id);

                    return (
                      <div key={idx} style={{
                        background: '#1a1a1a',
                        padding: 'calc(var(--space) * 2)',
                        borderLeft: '3px solid #0f0',
                        display: 'flex',
                        gap: 'calc(var(--space) * 2)',
                        alignItems: 'flex-start'
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: '#eee', fontSize: 'var(--type-body)', fontWeight: 500 }}>{change.description}</div>
                          {evidence && (
                            <div style={{ marginTop: 'var(--space)', fontSize: 'var(--type-small)', color: '#888', fontStyle: 'italic' }}>
                              Linked to: {evidence.title}
                            </div>
                          )}
                        </div>
                        {isNewEvidence && evidence?.imageUrl && (
                          <div style={{ width: '80px', height: '80px', flexShrink: 0, overflow: 'hidden', border: '1px solid #333' }}>
                            <img src={evidence.imageUrl} alt={evidence.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Edit conclusion */}
              {editReport.conclusion && (
                <section style={{ marginBottom: 'calc(var(--space) * 3)' }}>
                  <p style={{ color: '#aaa', fontSize: 'var(--type-body)', lineHeight: '1.5', margin: 0 }}>{editReport.conclusion}</p>
                </section>
              )}

              {/* Consistency as secondary addendum */}
              {report && typeof report === 'object' && (
                <details style={{ marginTop: 'calc(var(--space) * 2)', borderTop: '1px solid #222', paddingTop: 'calc(var(--space) * 2)' }}>
                  <summary style={{
                    color: '#666',
                    fontSize: 'var(--type-small)',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    cursor: 'pointer',
                    userSelect: 'none',
                    padding: 'var(--space) 0',
                  }}>Consistency Audit Details</summary>
                  <div style={{ marginTop: 'calc(var(--space) * 2)' }}>
                    {report.issuesFound && report.issuesFound !== 'No issues detected.' && (
                      <section style={{ marginBottom: 'calc(var(--space) * 2)' }}>
                        <h4 style={{ color: '#f55', fontSize: 'var(--type-body)', marginBottom: 'var(--space)', textTransform: 'uppercase', letterSpacing: '1px' }}>Issues Detected</h4>
                        <div style={{ color: '#888', fontSize: 'var(--type-small)' }}>
                          <Markdown>{report.issuesFound}</Markdown>
                        </div>
                      </section>
                    )}
                    {(report.changesMade || []).length > 0 && (
                      <section style={{ marginBottom: 'calc(var(--space) * 2)' }}>
                        <h4 style={{ color: '#888', fontSize: 'var(--type-body)', marginBottom: 'var(--space)', textTransform: 'uppercase', letterSpacing: '1px' }}>Additional Repairs</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space)' }}>
                          {(report.changesMade || []).map((change: any, idx: number) => (
                            <div key={idx} style={{
                              background: '#1a1a1a',
                              padding: 'var(--space) calc(var(--space) * 2)',
                              borderLeft: '2px solid #444',
                              color: '#999',
                              fontSize: 'var(--type-small)'
                            }}>
                              {change.description}
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                    {report.conclusion && (
                      <p style={{ color: '#666', fontSize: 'var(--type-small)', lineHeight: '1.5' }}>{report.conclusion}</p>
                    )}
                  </div>
                </details>
              )}
            </>
          ) : (
            /* === STANDALONE CONSISTENCY CHECK: Original layout === */
            report && typeof report === 'object' ? (
              <>
                <section style={{ marginBottom: 'calc(var(--space) * 3)' }}>
                  <h3 style={{ color: '#f55', fontSize: 'var(--type-body-lg)', marginBottom: 'var(--space)', textTransform: 'uppercase', letterSpacing: '1px' }}>Issues Detected</h3>
                  <div style={{ color: '#bbb', fontSize: 'var(--type-body)' }}>
                    <Markdown>{report.issuesFound || 'No issues detected.'}</Markdown>
                  </div>
                </section>

                <section style={{ marginBottom: 'calc(var(--space) * 3)' }}>
                  <h3 style={{ color: '#0f0', fontSize: 'var(--type-body-lg)', marginBottom: 'calc(var(--space) * 2)', textTransform: 'uppercase', letterSpacing: '1px' }}>Proposed Repairs</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--space) * 2)' }}>
                    {(report.changesMade || []).map((change: any, idx: number) => {
                      const evidence = change.evidenceId ?
                        [...(updatedCase?.initialEvidence || []), ...(updatedCase?.suspects || []).flatMap(s => s.hiddenEvidence || [])]
                          .find(e => e.id === change.evidenceId) : null;

                      const isNewEvidence = evidence &&
                        !(draftCase.initialEvidence || []).find(e => e.id === evidence.id) &&
                        !(draftCase.suspects || []).flatMap(s => s.hiddenEvidence || []).find(e => e.id === evidence.id);

                      return (
                        <div key={idx} style={{
                          background: '#1a1a1a',
                          padding: 'calc(var(--space) * 2)',
                          borderLeft: '3px solid #0f0',
                          display: 'flex',
                          gap: 'calc(var(--space) * 2)',
                          alignItems: 'flex-start'
                        }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: '#eee', fontSize: 'var(--type-body)', fontWeight: 500 }}>{change.description}</div>
                            {evidence && (
                              <div style={{ marginTop: 'var(--space)', fontSize: 'var(--type-small)', color: '#888', fontStyle: 'italic' }}>
                                Linked to: {evidence.title}
                              </div>
                            )}
                          </div>
                          {isNewEvidence && evidence?.imageUrl && (
                            <div style={{ width: '80px', height: '80px', flexShrink: 0, overflow: 'hidden', border: '1px solid #333' }}>
                              <img src={evidence.imageUrl} alt={evidence.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <h3 style={{ color: '#aaa', fontSize: 'var(--type-body-lg)', marginBottom: 'var(--space)', textTransform: 'uppercase', letterSpacing: '1px' }}>Conclusion</h3>
                  <p style={{ color: '#999', fontSize: 'var(--type-body)', lineHeight: '1.5' }}>{report.conclusion}</p>
                </section>
              </>
            ) : (
              <div style={{ color: '#ddd' }}>{String(report)}</div>
            )
          )}
        </div>

        <div style={{ display: 'flex', gap: 'calc(var(--space) * 2)', borderTop: '1px solid #333', padding: '20px 25px', justifyContent: 'flex-end', flexShrink: 0 }}>
          <SaveButton onClick={onDiscard} style={{ background: '#333', padding: '10px 20px' }}>Discard</SaveButton>
          <SaveButton onClick={onApply} style={{ padding: '10px 25px', background: '#0f0', color: '#000' }}>Apply All Changes</SaveButton>
        </div>
      </div>
    </div>
  );
};

export default ConsistencyModal;
