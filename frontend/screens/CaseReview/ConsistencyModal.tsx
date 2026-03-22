
import React from 'react';
import { type } from '../../theme';
import styled from 'styled-components';
import Markdown from 'react-markdown';
import { CaseData } from '../../types';

// --- Styled Components ---

const ModalOverlay = styled.div`
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 30px 20px;
`;

const ModalContainer = styled.div`
  background: #111;
  border: 1px solid #444;
  max-width: 800px;
  width: 95%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: 0 0 50px rgba(0,0,0,0.5);
  overflow: hidden;
`;

const ModalTitle = styled.h2`
  color: #fff;
  margin-top: 0;
  margin-bottom: 0;
  border-bottom: 1px solid #333;
  padding: 20px 25px;
  font-size: var(--type-h3);
  flex-shrink: 0;
  background: #111;
  position: relative;
  z-index: 1;
`;

const ModalScrollBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 20px 25px;
  min-height: 0;
`;

const ModalFooter = styled.div`
  display: flex;
  gap: calc(var(--space) * 2);
  border-top: 1px solid #333;
  padding: 20px 25px;
  justify-content: flex-end;
  flex-shrink: 0;
`;

const Section = styled.section<{ $mb?: boolean }>`
  margin-bottom: ${props => props.$mb !== false ? 'calc(var(--space) * 3)' : '0'};
`;

const SectionSmall = styled.section`
  margin-bottom: calc(var(--space) * 2);
`;

const SectionHeading = styled.h3<{ $color: string }>`
  color: ${props => props.$color};
  font-size: var(--type-body-lg);
  margin-bottom: var(--space);
  text-transform: uppercase;
  letter-spacing: 1px;
`;

const SectionHeadingSpaced = styled(SectionHeading)`
  margin-bottom: calc(var(--space) * 2);
`;

const SectionHeadingH4 = styled.h4<{ $color: string }>`
  color: ${props => props.$color};
  font-size: var(--type-body);
  margin-bottom: var(--space);
  text-transform: uppercase;
  letter-spacing: 1px;
`;

const RequestBox = styled.div`
  background: rgba(59,130,246,0.08);
  border: 1px solid rgba(59,130,246,0.2);
  padding: calc(var(--space) * 2);
  color: #ccc;
  font-size: var(--type-body);
  font-style: italic;
  line-height: 1.5;
`;

const ChangeList = styled.div`
  display: flex;
  flex-direction: column;
  gap: calc(var(--space) * 2);
`;

const ChangeListCompact = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space);
`;

const ChangeItem = styled.div`
  background: #1a1a1a;
  padding: calc(var(--space) * 2);
  border-left: 3px solid #0f0;
  display: flex;
  gap: calc(var(--space) * 2);
  align-items: flex-start;
`;

const ChangeItemCompact = styled.div`
  background: #1a1a1a;
  padding: var(--space) calc(var(--space) * 2);
  border-left: 2px solid #444;
  color: #999;
  font-size: var(--type-small);
`;

const ChangeContent = styled.div`
  flex: 1;
`;

const ChangeDescription = styled.div`
  color: #eee;
  font-size: var(--type-body);
  font-weight: 500;
`;

const ChangeLink = styled.div`
  margin-top: var(--space);
  font-size: var(--type-small);
  color: #888;
  font-style: italic;
`;

const EvidenceThumbnail = styled.div`
  width: 80px;
  height: 80px;
  flex-shrink: 0;
  overflow: hidden;
  border: 1px solid #333;
`;

const ThumbnailImg = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const ConclusionText = styled.p`
  color: #aaa;
  font-size: var(--type-body);
  line-height: 1.5;
  margin: 0;
`;

const AuditDetails = styled.details`
  margin-top: calc(var(--space) * 2);
  border-top: 1px solid #222;
  padding-top: calc(var(--space) * 2);
`;

const AuditSummary = styled.summary`
  color: #666;
  font-size: var(--type-small);
  text-transform: uppercase;
  letter-spacing: 1px;
  cursor: pointer;
  user-select: none;
  padding: var(--space) 0;
`;

const AuditBody = styled.div`
  margin-top: calc(var(--space) * 2);
`;

const IssuesMarkdown = styled.div`
  color: #888;
  font-size: var(--type-small);
`;

const StandaloneConclusionText = styled.p`
  color: #999;
  font-size: var(--type-body);
  line-height: 1.5;
`;

const AuditConclusionText = styled.p`
  color: #666;
  font-size: var(--type-small);
  line-height: 1.5;
`;

const IssuesText = styled.div`
  color: #bbb;
  font-size: var(--type-body);
`;

const FallbackText = styled.div`
  color: #ddd;
`;

const DiscardButton = styled.button`
  background: #333;
  color: var(--color-accent-green);
  border: 1px solid var(--color-accent-green);
  padding: 10px 20px;
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

const ApplyButton = styled.button`
  background: #0f0;
  color: #000;
  border: 1px solid var(--color-accent-green);
  padding: 10px 25px;
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
    <ModalOverlay>
      <ModalContainer>
        <ModalTitle>{editReport ? 'Case Transformation Report' : 'Narrative Audit Report'}</ModalTitle>

        <ModalScrollBody>
          {/* === EDIT-TRIGGERED MODAL: Show edit changes as primary content === */}
          {editReport && typeof editReport === 'object' ? (
            <>
              {/* User's original request */}
              <Section>
                <SectionHeading $color="#3b82f6">Your Request</SectionHeading>
                <RequestBox>
                  "{editPrompt}"
                </RequestBox>
              </Section>

              {/* Changes made by the edit */}
              <Section>
                <SectionHeadingSpaced $color="#0f0">Changes Applied</SectionHeadingSpaced>
                <ChangeList>
                  {(editReport.changesMade || []).map((change: any, idx: number) => {
                    const evidence = change.evidenceId ?
                      [...(updatedCase?.initialEvidence || []), ...(updatedCase?.suspects || []).flatMap(s => s.hiddenEvidence || [])]
                        .find(e => e.id === change.evidenceId) : null;

                    const isNewEvidence = evidence &&
                      !(draftCase.initialEvidence || []).find(e => e.id === evidence.id) &&
                      !(draftCase.suspects || []).flatMap(s => s.hiddenEvidence || []).find(e => e.id === evidence.id);

                    return (
                      <ChangeItem key={idx}>
                        <ChangeContent>
                          <ChangeDescription>{change.description}</ChangeDescription>
                          {evidence && (
                            <ChangeLink>
                              Linked to: {evidence.title}
                            </ChangeLink>
                          )}
                        </ChangeContent>
                        {isNewEvidence && evidence?.imageUrl && (
                          <EvidenceThumbnail>
                            <ThumbnailImg src={evidence.imageUrl} alt={evidence.title} referrerPolicy="no-referrer" />
                          </EvidenceThumbnail>
                        )}
                      </ChangeItem>
                    );
                  })}
                </ChangeList>
              </Section>

              {/* Edit conclusion */}
              {editReport.conclusion && (
                <Section>
                  <ConclusionText>{editReport.conclusion}</ConclusionText>
                </Section>
              )}

              {/* Consistency as secondary addendum */}
              {report && typeof report === 'object' && (
                <AuditDetails>
                  <AuditSummary>Consistency Audit Details</AuditSummary>
                  <AuditBody>
                    {report.issuesFound && report.issuesFound !== 'No issues detected.' && (
                      <SectionSmall>
                        <SectionHeadingH4 $color="#f55">Issues Detected</SectionHeadingH4>
                        <IssuesMarkdown>
                          <Markdown>{report.issuesFound}</Markdown>
                        </IssuesMarkdown>
                      </SectionSmall>
                    )}
                    {(report.changesMade || []).length > 0 && (
                      <SectionSmall>
                        <SectionHeadingH4 $color="#888">Additional Repairs</SectionHeadingH4>
                        <ChangeListCompact>
                          {(report.changesMade || []).map((change: any, idx: number) => (
                            <ChangeItemCompact key={idx}>
                              {change.description}
                            </ChangeItemCompact>
                          ))}
                        </ChangeListCompact>
                      </SectionSmall>
                    )}
                    {report.conclusion && (
                      <AuditConclusionText>{report.conclusion}</AuditConclusionText>
                    )}
                  </AuditBody>
                </AuditDetails>
              )}
            </>
          ) : (
            /* === STANDALONE CONSISTENCY CHECK: Original layout === */
            report && typeof report === 'object' ? (
              <>
                <Section>
                  <SectionHeading $color="#f55">Issues Detected</SectionHeading>
                  <IssuesText>
                    <Markdown>{report.issuesFound || 'No issues detected.'}</Markdown>
                  </IssuesText>
                </Section>

                <Section>
                  <SectionHeadingSpaced $color="#0f0">Proposed Repairs</SectionHeadingSpaced>
                  <ChangeList>
                    {(report.changesMade || []).map((change: any, idx: number) => {
                      const evidence = change.evidenceId ?
                        [...(updatedCase?.initialEvidence || []), ...(updatedCase?.suspects || []).flatMap(s => s.hiddenEvidence || [])]
                          .find(e => e.id === change.evidenceId) : null;

                      const isNewEvidence = evidence &&
                        !(draftCase.initialEvidence || []).find(e => e.id === evidence.id) &&
                        !(draftCase.suspects || []).flatMap(s => s.hiddenEvidence || []).find(e => e.id === evidence.id);

                      return (
                        <ChangeItem key={idx}>
                          <ChangeContent>
                            <ChangeDescription>{change.description}</ChangeDescription>
                            {evidence && (
                              <ChangeLink>
                                Linked to: {evidence.title}
                              </ChangeLink>
                            )}
                          </ChangeContent>
                          {isNewEvidence && evidence?.imageUrl && (
                            <EvidenceThumbnail>
                              <ThumbnailImg src={evidence.imageUrl} alt={evidence.title} referrerPolicy="no-referrer" />
                            </EvidenceThumbnail>
                          )}
                        </ChangeItem>
                      );
                    })}
                  </ChangeList>
                </Section>

                <section>
                  <SectionHeading $color="#aaa">Conclusion</SectionHeading>
                  <StandaloneConclusionText>{report.conclusion}</StandaloneConclusionText>
                </section>
              </>
            ) : (
              <FallbackText>{String(report)}</FallbackText>
            )
          )}
        </ModalScrollBody>

        <ModalFooter>
          <DiscardButton onClick={onDiscard}>Discard</DiscardButton>
          <ApplyButton onClick={onApply}>Apply All Changes</ApplyButton>
        </ModalFooter>
      </ModalContainer>
    </ModalOverlay>
  );
};

export default ConsistencyModal;
