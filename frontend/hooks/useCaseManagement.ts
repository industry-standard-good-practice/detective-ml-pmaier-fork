
import { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { GameState, ScreenState, CaseData, CaseStats } from '../types';
import { generateCaseFromPrompt, calculateDifficulty } from '../services/geminiService';
import { publishCase, deleteCase, updateCase, saveLocalDraft, fetchLocalDrafts, deleteLocalDraft, fetchCommunityCases, fetchUserCases, fetchAllCaseStats, fetchCaseStats, fetchUserVote, submitVote, recordGameResult } from '../services/persistence';
import { formatAuthorName } from '../utils/timeUtils';
import { User } from 'firebase/auth';

interface UseCaseManagementParams {
  user: User | null;
  isAdmin: boolean;
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  communityCases: CaseData[];
  setCommunityCases: React.Dispatch<React.SetStateAction<CaseData[]>>;
  localDrafts: CaseData[];
  setLocalDrafts: React.Dispatch<React.SetStateAction<CaseData[]>>;
  draftCase: CaseData | null;
  setDraftCase: React.Dispatch<React.SetStateAction<CaseData | null>>;
  originalDraftRef: React.MutableRefObject<CaseData | null>;
  setHasUnsavedDraftChanges: React.Dispatch<React.SetStateAction<boolean>>;
  allCaseStats: Record<string, CaseStats>;
  setAllCaseStats: React.Dispatch<React.SetStateAction<Record<string, CaseStats>>>;
  selectCase: (caseInput: string | CaseData, communityCases: CaseData[], localDrafts: CaseData[], draftCase: CaseData | null) => void;
}

export const useCaseManagement = ({
  user,
  isAdmin,
  gameState,
  setGameState,
  communityCases,
  setCommunityCases,
  localDrafts,
  setLocalDrafts,
  draftCase,
  setDraftCase,
  originalDraftRef,
  setHasUnsavedDraftChanges,
  allCaseStats,
  setAllCaseStats,
  selectCase,
}: UseCaseManagementParams) => {

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string>("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [pendingPublishDraftId, setPendingPublishDraftId] = useState<string | null>(null);
  const [caseToDelete, setCaseToDelete] = useState<string | null>(null);
  const [myCaseToDelete, setMyCaseToDelete] = useState<string | null>(null);
  const [currentCaseStats, setCurrentCaseStats] = useState<CaseStats | null>(null);
  const [currentUserVote, setCurrentUserVote] = useState<'up' | 'down' | null>(null);
  const [hasRecordedResult, setHasRecordedResult] = useState(false);

  const loadCommunity = async () => {
    const fetches: [Promise<CaseData[]>, Promise<CaseData[]>, Promise<Record<string, CaseStats>>] = [
      fetchCommunityCases(),
      user?.uid ? fetchUserCases(user.uid) : Promise.resolve([]),
      fetchAllCaseStats()
    ];
    const [publishedCases, userCases, stats] = await Promise.all(fetches);
    
    const caseMap = new Map<string, CaseData>();
    publishedCases.forEach(c => caseMap.set(c.id, c));
    userCases.forEach(c => caseMap.set(c.id, c));
    
    const validCases = Array.from(caseMap.values()).filter(c => 
      c && 
      c.id && typeof c.id === 'string' && c.id.trim() !== '' &&
      c.title && typeof c.title === 'string' && c.title.trim() !== ''
    );
    setCommunityCases(validCases);
    setAllCaseStats(stats);
  };

  const loadDrafts = () => {
    setLocalDrafts(fetchLocalDrafts());
  };

  const handleGenerateCase = async (prompt: string, isLucky: boolean) => {
    if (!user?.uid) {
        console.error('[CRITICAL] handleGenerateCase: No user logged in!');
        toast.error('You must be logged in to create a case.');
        return;
    }
    
    setIsGenerating(true);
    setGenerationStatus("Creating criminal profiles...");
    try {
        const newCase = await generateCaseFromPrompt(prompt, isLucky);
        newCase.authorId = user.uid;
        newCase.authorDisplayName = formatAuthorName(user.displayName);
        newCase.createdAt = Date.now();
        setGenerationStatus("");
        
        // Save immediately — images will be generated in the background on the edit screen
        saveLocalDraft(newCase);
        setLocalDrafts(fetchLocalDrafts());
        
        setDraftCase(newCase);
        originalDraftRef.current = JSON.parse(JSON.stringify(newCase));
        setGameState(prev => ({ ...prev, currentScreen: ScreenState.CASE_REVIEW }));
    } catch (e: any) {
        console.error("Generation Error:", e);
        toast.error(`Case generation failed: ${e.message || 'Unknown error'}`);
    } finally {
        setIsGenerating(false);
        setGenerationStatus("");
    }
  };

  const handleSaveAndStart = async () => {
    if (!draftCase) return;
    
    if (!user?.uid) {
        console.error('[CRITICAL] handleSaveAndStart: No user logged in!');
        toast.error('You must be logged in to save a case.');
        return;
    }
    
    const stamped: CaseData = {
      ...draftCase,
      authorId: user.uid,
      authorDisplayName: draftCase.authorDisplayName && draftCase.authorDisplayName !== 'Anonymous' && draftCase.authorDisplayName !== 'Unknown Author'
        ? draftCase.authorDisplayName
        : formatAuthorName(user.displayName),
      createdAt: draftCase.createdAt || Date.now()
    };

    if (stamped.isUploaded) {
        const success = await updateCase(stamped.id, stamped);
        if (!success) {
            toast.error('Failed to save changes to the server.');
            return;
        }
        await loadCommunity();
        saveLocalDraft(stamped);
        setLocalDrafts(fetchLocalDrafts());
        const updatedCase = communityCases.find(c => c.id === stamped.id) || stamped;
        selectCase(updatedCase, communityCases, localDrafts, draftCase);
    } else {
        saveLocalDraft(stamped);
        const refreshed = fetchLocalDrafts();
        setLocalDrafts(refreshed);
        const savedVersion = refreshed.find(d => d.id === stamped.id) || stamped;
        await updateCase(stamped.id, stamped);
        setCommunityCases(prev => {
            if (!stamped.id || !stamped.title) return prev;
            const exists = prev.some(c => c.id === stamped.id);
            if (exists) return prev.map(c => c.id === stamped.id ? savedVersion : c);
            return [savedVersion, ...prev];
        });
        selectCase(savedVersion, communityCases, localDrafts, draftCase);
    }
    setDraftCase(null);
    originalDraftRef.current = null;
  };

  const handleTestInvestigation = () => {
    if (draftCase) {
      selectCase(draftCase, communityCases, localDrafts, draftCase);
    }
  };

  const handleSaveDraftFromHeader = async () => {
    if (!draftCase) return;
    
    if (!user?.uid) {
      console.error('[CRITICAL] handleSaveDraftFromHeader: No user logged in!');
      toast.error('You must be logged in to save.');
      return;
    }
    
    const stamped: CaseData = {
      ...draftCase,
      authorId: user.uid,
      authorDisplayName: draftCase.authorDisplayName && draftCase.authorDisplayName !== 'Anonymous' && draftCase.authorDisplayName !== 'Unknown Author'
        ? draftCase.authorDisplayName
        : formatAuthorName(user.displayName),
    };
    
    const { updateCase: doUpdate, saveLocalDraft: doSaveLocal } = await import('../services/persistence');
    doSaveLocal(stamped);
    const refreshedDrafts = fetchLocalDrafts();
    setLocalDrafts(refreshedDrafts);
    const savedVersion = refreshedDrafts.find(d => d.id === stamped.id) || stamped;
    const success = await doUpdate(stamped.id, stamped);
    setDraftCase(savedVersion);
    originalDraftRef.current = JSON.parse(JSON.stringify(savedVersion));
    setHasUnsavedDraftChanges(false);
    if (success) {
      toast.success('Case saved successfully!');
    } else {
      toast.error('Firebase save failed — saved locally as fallback.');
    }
  };

  const handleEditCase = (caseId?: string | any) => {
    const idToEdit = (typeof caseId === 'string') ? caseId : gameState.selectedCaseId;

    if (draftCase && draftCase.id === idToEdit) {
      setGameState(prev => ({ ...prev, currentScreen: ScreenState.CASE_REVIEW }));
      return;
    }

    const caseToEdit = communityCases.find(c => c.id === idToEdit) || localDrafts.find(d => d.id === idToEdit);
    if (!caseToEdit) return;

    originalDraftRef.current = JSON.parse(JSON.stringify(caseToEdit));
    setDraftCase(caseToEdit);
    setGameState(prev => ({ ...prev, currentScreen: ScreenState.CASE_REVIEW }));
  };

  const initiatePublish = () => {
    if (!gameState.selectedCaseId) return;
    setShowPublishConfirm(true);
  };

  const executePublish = async () => {
    setShowPublishConfirm(false); 
    if (!gameState.selectedCaseId || !user?.uid) return;
    const caseToPublish = communityCases.find(c => c.id === gameState.selectedCaseId);
    if (!caseToPublish) return;

    setIsPublishing(true);
    const success = await publishCase(
      { ...caseToPublish, isUploaded: true, authorId: user.uid }, 
      user.uid, 
      formatAuthorName(user.displayName)
    );
    
    if (success) {
      deleteLocalDraft(caseToPublish.id);
      setLocalDrafts(fetchLocalDrafts());
      await loadCommunity();
    }
    setIsPublishing(false);
  };

  const handlePublishDraft = (caseId: string) => {
    if (!user?.uid) {
      toast.error('You must be logged in to publish.');
      return;
    }
    setPendingPublishDraftId(caseId);
  };

  const executePublishDraft = async () => {
    const caseId = pendingPublishDraftId;
    setPendingPublishDraftId(null);
    if (!caseId || !user?.uid) return;
    const draft = localDrafts.find(d => d.id === caseId) || communityCases.find(c => c.id === caseId);
    if (!draft) return;
    setIsPublishing(true);
    const success = await publishCase(
      { ...draft, isUploaded: true, authorId: user.uid },
      user.uid,
      formatAuthorName(user.displayName)
    );
    if (success) {
      deleteLocalDraft(caseId);
      setLocalDrafts(fetchLocalDrafts());
      await loadCommunity();
    }
    setIsPublishing(false);
  };

  const handleUnpublishCase = async (caseId: string) => {
    const caseToUnpublish = communityCases.find(c => c.id === caseId);
    if (!caseToUnpublish) return;
    saveLocalDraft({ ...caseToUnpublish, isUploaded: false });
    setLocalDrafts(fetchLocalDrafts());
    const success = await deleteCase(caseId);
    if (success) {
      await loadCommunity();
    }
  };

  const handleDeleteDraft = (caseId: string) => {
    deleteLocalDraft(caseId);
    setLocalDrafts(fetchLocalDrafts());
  };

  const handlePlayDraft = (caseData: CaseData) => {
    setCommunityCases(prev => {
      const exists = prev.some(c => c.id === caseData.id);
      return exists ? prev : [caseData, ...prev];
    });
    selectCase(caseData, communityCases, localDrafts, draftCase);
  };

  const handleDeleteCase = async (caseId: string) => {
    if (!isAdmin) return;
    setCaseToDelete(caseId);
  };

  const handleDeleteMyCase = (caseId: string) => {
    setMyCaseToDelete(caseId);
  };

  const confirmDeleteMyCase = async () => {
    if (!myCaseToDelete) return;
    const isPublished = communityCases.some(c => c.id === myCaseToDelete && c.isUploaded);
    if (isPublished) {
      await deleteCase(myCaseToDelete);
    }
    deleteLocalDraft(myCaseToDelete);
    setLocalDrafts(fetchLocalDrafts());
    setCommunityCases(prev => prev.filter(c => c.id !== myCaseToDelete));
    setMyCaseToDelete(null);
  };

  const confirmDeleteCase = async () => {
    if (!caseToDelete || !isAdmin) return;
    const success = await deleteCase(caseToDelete);
    if (success) {
      setCommunityCases(prev => prev.filter(c => c.id !== caseToDelete));
    }
    setCaseToDelete(null);
  };

  const handleToggleFeatured = async (caseId: string, isFeatured: boolean) => {
    if (!isAdmin) return;
    const targetCase = communityCases.find(c => c.id === caseId);
    const authorId = targetCase?.authorId || user?.uid;
    if (!authorId) return;
    const success = await updateCase(caseId, { isFeatured, authorId });
    if (success) {
      setCommunityCases(prev => prev.map(c => c.id === caseId ? { ...c, isFeatured } : c));
    }
  };

  const makeAccusation = async (suspectIds: string[], findCaseById: (id: string | null | undefined) => CaseData | undefined) => {
    const currentCase = findCaseById(gameState.selectedCaseId)!;
    
    const guiltySuspectIds = currentCase.suspects.filter(s => s.isGuilty).map(s => s.id);
    const accusedGuiltyIds = suspectIds.filter(id => guiltySuspectIds.includes(id));
    const accusedInnocentIds = suspectIds.filter(id => !guiltySuspectIds.includes(id));

    let result: 'SUCCESS' | 'PARTIAL' | 'FAILURE';
    if (accusedGuiltyIds.length === guiltySuspectIds.length && accusedInnocentIds.length === 0) {
        result = 'SUCCESS';
    } else if (accusedGuiltyIds.length > 0) {
        result = 'PARTIAL';
    } else {
        result = 'FAILURE';
    }

    setHasRecordedResult(false);

    setGameState(prev => ({
      ...prev,
      gameResult: result,
      accusedSuspectIds: suspectIds,
      currentScreen: ScreenState.ENDGAME
    }));

    const suspectsSpoken = Object.keys(gameState.chatHistory).filter(
      sid => (gameState.chatHistory[sid] || []).some(m => m.sender === 'player')
    ).length;
    const evidenceFound = gameState.evidenceDiscovered.length;
    const timelineFound = gameState.timelineStatementsDiscovered.length;

    if (currentCase.isUploaded) {
      await recordGameResult(currentCase.id, result, { evidenceFound, suspectsSpoken, timelineFound });
      const [stats, vote] = await Promise.all([
        fetchCaseStats(currentCase.id),
        user ? fetchUserVote(currentCase.id, user.uid) : Promise.resolve(null)
      ]);
      setCurrentCaseStats(stats);
      setCurrentUserVote(vote);
      const allStats = await fetchAllCaseStats();
      setAllCaseStats(allStats);
    }
    setHasRecordedResult(true);
  };

  const handleVote = async (vote: 'up' | 'down') => {
    if (!user || !gameState.selectedCaseId) return;
    await submitVote(gameState.selectedCaseId, user.uid, vote);
    setCurrentUserVote(vote);
    const stats = await fetchCaseStats(gameState.selectedCaseId);
    setCurrentCaseStats(stats);
    setAllCaseStats(prev => ({ ...prev, [gameState.selectedCaseId!]: stats }));
  };

  return {
    // State
    isGenerating,
    generationStatus,
    isPublishing,
    showPublishConfirm,
    setShowPublishConfirm,
    pendingPublishDraftId,
    setPendingPublishDraftId,
    caseToDelete,
    setCaseToDelete,
    myCaseToDelete,
    setMyCaseToDelete,
    currentCaseStats,
    currentUserVote,
    hasRecordedResult,
    // Data fetching
    loadCommunity,
    loadDrafts,
    // Actions
    handleGenerateCase,
    handleSaveAndStart,
    handleTestInvestigation,
    handleSaveDraftFromHeader,
    handleEditCase,
    initiatePublish,
    executePublish,
    handlePublishDraft,
    executePublishDraft,
    handleUnpublishCase,
    handleDeleteDraft,
    handlePlayDraft,
    handleDeleteCase,
    handleDeleteMyCase,
    confirmDeleteMyCase,
    confirmDeleteCase,
    handleToggleFeatured,
    makeAccusation,
    handleVote,
  };
};
