/**
 * Frontend geminiChat.ts — refactored to delegate all Gemini calls to the backend.
 * Function signatures are preserved for backward compatibility.
 */
import { geminiPost } from './backendGemini';
import { CaseData, Evidence, Suspect, ChatMessage, TimelineStatement } from '../types';

export const getSuspectResponse = async (
  suspect: Suspect,
  caseData: CaseData,
  userInput: string,
  type: 'talk' | 'action',
  evidenceAttachment: string | null,
  currentAggravation: number,
  isFirstTurn: boolean,
  discoveredEvidence: Evidence[] = [],
  currentGameTime?: number,
  conversationHistory: ChatMessage[] = []
): Promise<{
  text: string;
  emotion: string;
  environmentEvidenceId: string;
  aggravationDelta: number;
  revealedEvidence: string[];
  revealedTimelineStatements: { time: string; statement: string; day: string; dayOffset: number }[];
  hints: string[];
}> => {
  return geminiPost('/chat/suspect', {
    suspect, caseData, userInput, type, evidenceAttachment,
    currentAggravation, isFirstTurn, discoveredEvidence,
    currentGameTime, conversationHistory
  });
};

export const generateCaseSummary = async (
  caseData: CaseData,
  accusedId: string | null,
  gameResult: 'SUCCESS' | 'PARTIAL' | 'FAILURE',
  evidenceDiscovered: Evidence[]
): Promise<string> => {
  const result = await geminiPost<{ text: string }>('/chat/case-summary', {
    caseData, accusedId, gameResult, evidenceDiscovered
  });
  return result.text;
};

/** Timeline rows the player has confirmed (same shape as partner). */
export type OfficerChatTimelineRow = Pick<
  TimelineStatement,
  'time' | 'statement' | 'day' | 'suspectName'
>;

export function mapTimelineForOfficerChat(discovered: TimelineStatement[]): OfficerChatTimelineRow[] {
  return (discovered || []).map((t) => ({
    time: t.time,
    statement: t.statement,
    day: t.day,
    suspectName: t.suspectName,
  }));
}

export const getOfficerChatResponse = async (
  caseData: CaseData,
  userMessage: string,
  evidenceFound: Evidence[],
  notes: Record<string, string[]>,
  chatHistory: Record<string, ChatMessage[]>,
  timelineKnown: OfficerChatTimelineRow[] = [],
  officerThread: ChatMessage[] = []
): Promise<string> => {
  const result = await geminiPost<{ text: string }>('/chat/officer', {
    caseData,
    userMessage,
    evidenceFound,
    notes,
    chatHistory,
    timelineKnown,
    officerThread,
  });
  return result.text;
};

export const getPartnerIntervention = async (
  type: 'goodCop' | 'badCop' | 'examine' | 'hint',
  suspect: Suspect,
  caseData: CaseData,
  history: ChatMessage[],
  discoveredEvidence: Evidence[] = [],
  timelineKnown: Pick<TimelineStatement, 'time' | 'statement' | 'day' | 'suspectName'>[] = []
): Promise<string> => {
  const result = await geminiPost<{ text: string }>('/chat/partner', {
    type,
    suspect,
    caseData,
    history,
    discoveredEvidence,
    timelineKnown,
  });
  return result.text;
};

export const getBadCopHint = async (
  suspect: Suspect,
  discoveredEvidence: Evidence[],
  responseText: string
): Promise<string> => {
  const result = await geminiPost<{ text: string }>('/chat/badcop-hint', {
    suspect,
    discoveredEvidence,
    responseText,
  });
  return result.text;
};
