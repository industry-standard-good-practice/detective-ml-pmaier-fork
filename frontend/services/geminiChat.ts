/**
 * Frontend geminiChat.ts — refactored to delegate all Gemini calls to the backend.
 * Function signatures are preserved for backward compatibility.
 */
import { geminiPost } from './backendGemini';
import { CaseData, Evidence, Suspect, ChatMessage } from '../types';

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

export const getOfficerChatResponse = async (
  caseData: CaseData,
  userMessage: string,
  evidenceFound: Evidence[],
  notes: Record<string, string[]>,
  chatHistory: Record<string, ChatMessage[]>
): Promise<string> => {
  const result = await geminiPost<{ text: string }>('/chat/officer', {
    caseData, userMessage, evidenceFound, notes, chatHistory
  });
  return result.text;
};

export const getPartnerIntervention = async (
  type: 'goodCop' | 'badCop' | 'examine' | 'hint',
  suspect: Suspect,
  caseData: CaseData,
  history: ChatMessage[],
  discoveredEvidence: Evidence[] = []
): Promise<string> => {
  const result = await geminiPost<{ text: string }>('/chat/partner', {
    type, suspect, caseData, history, discoveredEvidence
  });
  return result.text;
};

export const getBadCopHint = async (
  suspect: Suspect,
  unrevealed: Evidence[],
  responseText: string
): Promise<string> => {
  const result = await geminiPost<{ text: string }>('/chat/badcop-hint', {
    suspect, unrevealed, responseText
  });
  return result.text;
};
