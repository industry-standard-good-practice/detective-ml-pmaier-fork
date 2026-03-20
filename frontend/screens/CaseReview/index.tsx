
import React, { useState, useEffect, useRef } from 'react';
import { type } from '../../theme';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { CaseData, Suspect, Emotion, Evidence } from '../../types';
import { TTS_VOICES, getRandomVoice } from '../../constants';
import { generateTTS } from '../../services/geminiTTS';
import { playAudioFromUrl } from '../../services/audioPlayer';
import { pregenerateCaseImages, generateEvidenceImage, checkCaseConsistency, editCaseWithPrompt, calculateDifficulty, generateEmotionalVariantsFromBase } from '../../services/geminiService';
import SuspectPortrait from '@/components/SuspectPortrait';
import ExitCaseDialog from '@/components/ExitCaseDialog';
import ImageEditorModal from '@/components/ImageEditorModal';
import Spinner from '@/components/Spinner';

// Sub-components
import CaseDetailsPanel from './CaseDetailsPanel';
import SuspectEditorPanel from './SuspectEditorPanel';
import ConsistencyModal from './ConsistencyModal';

// --- Layout Styled Components ---

const Container = styled.div`
  display: flex;
  height: 100%;
  padding: 20px var(--screen-edge-horizontal) calc(var(--screen-edge-bottom) + 20px) var(--screen-edge-horizontal);
  gap: calc(var(--space) * 3);
  position: relative;

  @media (max-width: 1080px) {
    flex-direction: column;
    padding: 10px var(--screen-edge-horizontal) calc(var(--screen-edge-bottom) + 20px) var(--screen-edge-horizontal);
    gap: 0;
    overflow-x: hidden;
    min-width: 0;
  }
`;

const MobileTabBar = styled.div`
  display: none;
  @media (max-width: 1080px) {
    display: flex;
    gap: 0;
    margin-bottom: var(--space);
    flex-shrink: 0;
  }
`;

const MobileTab = styled.button<{ $active: boolean }>`
  flex: 1;
  background: ${props => props.$active ? 'var(--color-surface-raised)' : 'var(--color-surface)'};
  border: 1px solid ${props => props.$active ? 'var(--color-accent-green)' : 'var(--color-border)'};
  border-bottom: ${props => props.$active ? '2px solid var(--color-accent-green)' : '1px solid var(--color-border)'};
  color: ${props => props.$active ? 'var(--color-accent-green)' : 'var(--color-text-dim)'};
  font-family: inherit;
  ${type.body}
  padding: var(--space);
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 1px;
  transition: all 0.2s;
`;

const LeftColumn = styled.div<{ $mobileHidden?: boolean }>`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: var(--space);
  @media (max-width: 1080px) {
    display: ${props => props.$mobileHidden ? 'none' : 'flex'};
    flex: 1;
  }
`;

const DesktopOnly = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space);
  flex-shrink: 0;
  @media (max-width: 1080px) { display: none; }
`;

const Overlay = styled.div`
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
  flex-direction: column;
  gap: calc(var(--space) * 3);
`;

const LoadingText = styled.div`
  color: var(--color-accent-green);
  ${type.bodyLg}
  font-family: inherit;
  text-transform: uppercase;
  text-align: center;
  padding: 0 calc(var(--space) * 2);
`;

const CameraOverlay = styled.div`
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: #000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 2000;
`;

const VideoPreview = styled.video`
  width: 100%;
  max-width: 600px;
  max-height: 70%;
  border: 2px solid var(--color-accent-green);
  background: var(--color-surface-raised);
  box-shadow: 0 0 20px var(--color-accent-green);
`;

const CameraControls = styled.div`
  display: flex;
  gap: calc(var(--space) * 3);
  margin-top: calc(var(--space) * 3);
`;

const SnapButton = styled.button`
  width: 80px;
  height: 80px;
  background: var(--color-accent-red);
  border: 4px solid var(--color-text-bright);
  cursor: pointer;
  box-shadow: 0 0 10px var(--color-accent-red);
  &:hover { transform: scale(1.1); }
  &:active { transform: scale(0.95); }
`;

const UtilityButton = styled.button`
  background: var(--color-border-subtle);
  color: #ccc;
  border: 1px solid var(--color-border);
  padding: var(--space);
  cursor: pointer;
  font-family: inherit;
  ${type.small}
  text-transform: uppercase;
  &:hover { background: #333; color: var(--color-text-bright); }
`;

const ActionButtons = styled.div`
  margin-top: auto;
  display: flex;
  gap: var(--space);
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

// --- Props ---

interface CaseReviewProps {
  draftCase: CaseData;
  originalBaseline?: CaseData | null;
  onUpdateDraft: (updated: CaseData) => void;
  onStart: () => void;
  onCancel: () => void;
  userId?: string;
  userDisplayName?: string;
  onRegisterSave?: (saveFn: () => Promise<void>) => void;
  onRegisterCheckConsistency?: (fn: () => void) => void;
  onRegisterClose?: (fn: () => void) => void;
  onHasUnsavedChanges?: (hasChanges: boolean) => void;
}

const CaseReview: React.FC<CaseReviewProps> = ({ draftCase, originalBaseline, onUpdateDraft, onStart, onCancel, userId, userDisplayName, onRegisterSave, onRegisterCheckConsistency, onRegisterClose, onHasUnsavedChanges }) => {
  const [selectedSuspectId, setSelectedSuspectId] = useState<string | null>(draftCase.suspects?.[0]?.id || 'officer');
  const [loadingState, setLoadingState] = useState<{ visible: boolean, message: string, step?: string, stepDetail?: string }>({ visible: false, message: '' });
  const [showCamera, setShowCamera] = useState(false);
  const [isPreviewingVoice, setIsPreviewingVoice] = useState(false);
  const [showSuspectEditor, setShowSuspectEditor] = useState(false);
  const [showHeroEditor, setShowHeroEditor] = useState(false);
  const [heroMode, setHeroMode] = useState<'suspect' | 'evidence' | 'custom'>('custom');
  const [editPrompt, setEditPrompt] = useState('');
  const [mobileTab, setMobileTab] = useState<'case' | 'suspects'>('case');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const saveBaselineRef = useRef<CaseData>(JSON.parse(JSON.stringify(originalBaseline || draftCase)));
  const baselineRef = useRef<CaseData>(JSON.parse(JSON.stringify(originalBaseline || draftCase)));
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(() => {
    return JSON.stringify(draftCase) !== JSON.stringify(saveBaselineRef.current);
  });

  useEffect(() => {
    const changed = JSON.stringify(draftCase) !== JSON.stringify(saveBaselineRef.current);
    setHasUnsavedChanges(changed);
    onHasUnsavedChanges?.(changed);
  }, [draftCase]);

  useEffect(() => { onRegisterSave?.(() => handleSave()); });
  useEffect(() => { onRegisterCheckConsistency?.(() => handleCheckConsistency()); });
  useEffect(() => { onRegisterClose?.(() => handleCancel()); });

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [suspectToDelete, setSuspectToDelete] = useState<Suspect | null>(null);
  const [consistencyModal, setConsistencyModal] = useState<{ visible: boolean, report: any, updatedCase: CaseData | null, editReport?: any, editPrompt?: string }>({ visible: false, report: null, updatedCase: null });
  const [voicePreviewUrl, setVoicePreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => { if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl); };
  }, [voicePreviewUrl]);

  // --- AUTOMATIC DIFFICULTY CALCULATION ---
  useEffect(() => {
    const newDifficulty = calculateDifficulty(draftCase);
    if (newDifficulty !== draftCase.difficulty) {
      onUpdateDraft({ ...draftCase, difficulty: newDifficulty });
    }
  }, [draftCase.suspects, draftCase.initialEvidence]);

  const activeSuspect = selectedSuspectId === 'officer' ? draftCase.officer :
    selectedSuspectId === 'partner' ? draftCase.partner :
      draftCase.suspects?.find(s => s.id === selectedSuspectId);
  const isSupportChar = selectedSuspectId === 'officer' || selectedSuspectId === 'partner';

  // --- HANDLERS ---

  const handleCancel = () => {
    if (hasUnsavedChanges) {
      setShowCancelDialog(true);
    } else {
      onCancel();
    }
  };

  const handleCaseChange = (field: keyof CaseData, value: any) => {
    onUpdateDraft({ ...draftCase, [field]: value });
  };

  const handleSuspectChange = (id: string, field: string, value: any) => {
    if (id === 'officer') {
      const overrides: any = { [field]: value };
      if (field === 'avatarSeed') overrides.portraits = {};
      onUpdateDraft({ ...draftCase, officer: { ...draftCase.officer, ...overrides } });
      return;
    }
    if (id === 'partner') {
      const overrides: any = { [field]: value };
      if (field === 'avatarSeed') overrides.portraits = {};
      onUpdateDraft({ ...draftCase, partner: { ...draftCase.partner, ...overrides } });
      return;
    }
    const updatedSuspects = (draftCase.suspects || []).map(s => {
      if (s.id === id) {
        const overrides: any = { [field]: value };
        if (field === 'avatarSeed') overrides.portraits = {};
        return { ...s, ...overrides };
      }
      return s;
    });
    onUpdateDraft({ ...draftCase, suspects: updatedSuspects });
  };

  const handleRerollEvidence = async (ev: Evidence, source: 'initial' | 'hidden', suspectId?: string) => {
    setLoadingState({ visible: true, message: `Rerolling evidence image: ${ev.title}...` });
    const updateImage = (url?: string) => {
      if (source === 'initial') {
        const newInit = (draftCase.initialEvidence || []).map(e => e.id === ev.id ? { ...e, imageUrl: url } : e);
        onUpdateDraft({ ...draftCase, initialEvidence: newInit });
      } else if (suspectId) {
        const newSuspects = (draftCase.suspects || []).map(s => {
          if (s.id === suspectId) {
            return { ...s, hiddenEvidence: (s.hiddenEvidence || []).map(e => e.id === ev.id ? { ...e, imageUrl: url } : e) };
          }
          return s;
        });
        onUpdateDraft({ ...draftCase, suspects: newSuspects });
      }
    };
    updateImage(undefined);

    let refImage: string | undefined;
    if (suspectId) {
      const ownerSuspect = draftCase.suspects?.find(s => s.id === suspectId);
      if (ownerSuspect?.isDeceased && ownerSuspect.portraits?.[Emotion.NEUTRAL]) {
        refImage = ownerSuspect.portraits[Emotion.NEUTRAL];
      }
    }

    try {
      const newUrl = await generateEvidenceImage(ev, draftCase.id, userId!, refImage);
      if (newUrl) updateImage(newUrl);
    } catch (e: any) {
      console.error("Evidence reroll failed", e);
      toast.error(`Evidence image reroll failed: ${e?.message || 'Unknown error'}`);
    }
    setLoadingState({ visible: false, message: '' });
  };

  const handleTransferEvidence = (evidence: Evidence, fromOwner: string, toOwner: string) => {
    let newInitial = [...(draftCase.initialEvidence || [])];
    let newSuspects = (draftCase.suspects || []).map(s => ({ ...s, hiddenEvidence: [...(s.hiddenEvidence || [])] }));

    if (fromOwner === 'initial') {
      newInitial = newInitial.filter(e => e.id !== evidence.id);
    } else {
      newSuspects = newSuspects.map(s =>
        s.id === fromOwner ? { ...s, hiddenEvidence: s.hiddenEvidence.filter(e => e.id !== evidence.id) } : s
      );
    }

    if (toOwner === 'initial') {
      newInitial.push(evidence);
    } else {
      newSuspects = newSuspects.map(s =>
        s.id === toOwner ? { ...s, hiddenEvidence: [...s.hiddenEvidence, evidence] } : s
      );
    }

    onUpdateDraft({ ...draftCase, initialEvidence: newInitial, suspects: newSuspects });
  };

  const handleRetryAI = async () => {
    if (loadingState.visible) return;
    setLoadingState({ visible: true, message: "Initializing AI protocols..." });
    const clone: CaseData = JSON.parse(JSON.stringify(draftCase));
    clone.suspects.forEach(s => {
      const neutral = s.portraits?.[Emotion.NEUTRAL];
      if (!neutral || neutral.includes('dicebear')) s.portraits = {};
    });
    try {
      await pregenerateCaseImages(clone, (msg) => setLoadingState({ visible: true, message: msg }), userId!);
      onUpdateDraft(clone);
    } catch (e: any) {
      console.error("Retry failed", e);
      toast.error(`Image regeneration failed: ${e?.message || 'Unknown error. Try again.'}`);
    } finally {
      setLoadingState({ visible: false, message: '' });
    }
  };

  const handleSaveEditedSuspect = async (newImageUrl: string, onProgress?: (current: number, total: number) => void) => {
    if (!activeSuspect) return;
    try {
      const updatedPortraits = await generateEmotionalVariantsFromBase(newImageUrl, activeSuspect as any, draftCase.id, userId!, onProgress);
      handleSuspectChange(activeSuspect.id, 'portraits', updatedPortraits);
      setShowSuspectEditor(false);
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const handleSaveHeroImage = async (newImageUrl: string) => {
    setLoadingState({ visible: true, message: "Uploading Hero Image..." });
    try {
      const { uploadImage } = await import('../../services/firebase');
      const uploadedUrl = await uploadImage(newImageUrl, `images/${userId!}/cases/${draftCase.id}/hero.png`);
      handleCaseChange('heroImageUrl', uploadedUrl);
      setShowHeroEditor(false);
    } catch (err) {
      console.error("Hero image upload failed", err);
      toast.error('Failed to upload hero image.');
    } finally {
      setLoadingState({ visible: false, message: '' });
    }
  };

  const handleRerollPortrait = async () => {
    if (!activeSuspect) return;
    setLoadingState({ visible: true, message: "Generating base portrait..." });
    try {
      const { regenerateSingleSuspect } = await import('../../services/geminiImages');
      const updatedChar = await regenerateSingleSuspect(
        activeSuspect as any, draftCase.id, userId!, draftCase.type,
        (progressMsg) => setLoadingState({ visible: true, message: progressMsg })
      );
      if (selectedSuspectId === 'officer') {
        onUpdateDraft({ ...draftCase, officer: updatedChar as any });
      } else if (selectedSuspectId === 'partner') {
        onUpdateDraft({ ...draftCase, partner: updatedChar as any });
      } else {
        const newSuspects = draftCase.suspects.map(s => s.id === updatedChar.id ? updatedChar as any : s);
        onUpdateDraft({ ...draftCase, suspects: newSuspects });
      }
      toast.success(`Portrait regenerated for ${activeSuspect.name}!`);
    } catch (e: any) {
      console.error("Single Reroll Failed", e);
      toast.error(`Portrait generation failed: ${e?.message || 'Unknown error'}`);
      handleSuspectChange(activeSuspect.id, 'avatarSeed', Math.floor(Math.random() * 999999));
    } finally {
      setLoadingState({ visible: false, message: '' });
    }
  };

  const processSuspectImage = async (base64: string) => {
    if (!activeSuspect) return;
    try {
      setLoadingState({ visible: true, message: "Converting photo to pixel art..." });
      const { generateSuspectFromUpload } = await import('../../services/geminiImages');
      const updatedChar = await generateSuspectFromUpload(
        activeSuspect as any, base64, draftCase.id, userId!,
        (progressMsg) => setLoadingState({ visible: true, message: progressMsg })
      );
      if (selectedSuspectId === 'officer') {
        onUpdateDraft({ ...draftCase, officer: updatedChar as any });
      } else if (selectedSuspectId === 'partner') {
        onUpdateDraft({ ...draftCase, partner: updatedChar as any });
      } else {
        const newSuspects = draftCase.suspects.map(s => s.id === updatedChar.id ? updatedChar as any : s);
        onUpdateDraft({ ...draftCase, suspects: newSuspects });
      }
    } catch (err: any) {
      console.error(err);
      toast.error(`Image upload failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setLoadingState({ visible: false, message: '' });
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    setLoadingState({ visible: true, message: "Reading file..." });
    reader.onload = (event) => {
      if (!event.target?.result) return;
      processSuspectImage(event.target.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handlePasteFromClipboard = async (callback: (base64: string) => void) => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const reader = new FileReader();
          reader.onload = (e) => {
            const base64 = e.target?.result as string;
            if (base64) { callback(base64); toast.success('Image pasted from clipboard!'); }
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
      toast.error('No image found on clipboard.');
    } catch (err: any) {
      console.error('Clipboard paste failed:', err);
      if (err?.name === 'NotAllowedError') {
        toast.error('Clipboard access denied. Please allow clipboard permissions.');
      } else {
        toast.error('Could not read clipboard. Try copying an image first.');
      }
    }
  };

  // Camera
  const startCamera = async () => {
    try {
      setShowCamera(true);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setTimeout(() => { if (videoRef.current) videoRef.current.play(); }, 100);
      }
    } catch (e) {
      console.error("Camera access denied", e);
      toast.error('Could not access camera. Please check browser permissions.');
      setShowCamera(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());
    }
    setShowCamera(false);
  };

  const takePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      const base64 = canvas.toDataURL('image/png');
      stopCamera();
      processSuspectImage(base64);
    }
  };

  const handleAddSuspect = () => {
    const newId = `s-${Date.now()}`;
    const newSuspect: Suspect = {
      id: newId, name: "Unknown Subject", gender: "Unknown", age: 30, role: "Witness",
      status: "Person of Interest", bio: "A mysterious figure.", personality: "Nervous",
      avatarSeed: Math.floor(Math.random() * 999999), baseAggravation: 10, isGuilty: false,
      secret: "None", hiddenEvidence: [], portraits: {},
      alibi: { statement: "I was nowhere near the scene.", isTrue: true, location: "Unknown", witnesses: [] },
      motive: "None", relationships: [], timeline: [], knownFacts: [],
      professionalBackground: "Unknown", witnessObservations: "None",
      voice: getRandomVoice("Unknown")
    };
    onUpdateDraft({ ...draftCase, suspects: [...draftCase.suspects, newSuspect] });
    setSelectedSuspectId(newId);
  };

  const handleDeleteSuspect = () => {
    if (!activeSuspect || isSupportChar) return;
    setSuspectToDelete(activeSuspect as Suspect);
  };

  const confirmDeleteSuspect = () => {
    if (!suspectToDelete) return;
    const newSuspects = draftCase.suspects?.filter(s => s.id !== suspectToDelete.id) || [];
    onUpdateDraft({ ...draftCase, suspects: newSuspects });
    setSelectedSuspectId(newSuspects[0]?.id || null);
    setSuspectToDelete(null);
  };

  const handleSave = async () => {
    if (!userId) { toast.error('Cannot save: No user ID.'); return; }
    setLoadingState({ visible: true, message: "Saving case..." });
    try {
      const { updateCase, saveLocalDraft } = await import('../../services/persistence');
      const stampedCase = {
        ...draftCase,
        authorId: draftCase.authorId || userId,
        authorDisplayName: draftCase.authorDisplayName || userDisplayName || 'Unknown Author'
      };
      saveLocalDraft(stampedCase);
      const success = await updateCase(stampedCase.id, stampedCase);
      onUpdateDraft(stampedCase);
      saveBaselineRef.current = JSON.parse(JSON.stringify(stampedCase));
      setHasUnsavedChanges(false);
      onHasUnsavedChanges?.(false);
      if (success) { toast.success("Case saved successfully!"); }
      else { toast.error("Firebase save failed — saved locally as fallback."); }
    } catch (err: any) {
      console.error("[CRITICAL] handleSave error:", err);
      toast.error(`Save failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setLoadingState({ visible: false, message: '' });
    }
  };

  const handleCheckConsistency = async () => {
    setLoadingState({ visible: true, message: "Initializing Narrative Audit...", step: 'Step 1/1', stepDetail: 'Consistency Check' });
    try {
      const { updatedCase, report } = await checkCaseConsistency(draftCase, (msg) => {
        setLoadingState({ visible: true, message: msg, step: 'Step 1/1', stepDetail: 'Consistency Check' });
      }, baselineRef.current);
      setConsistencyModal({ visible: true, report, updatedCase });
    } catch (e) {
      console.error("Consistency Audit Failed:", e);
      toast.error('Failed to generate consistency report.');
    } finally {
      setLoadingState({ visible: false, message: '' });
    }
  };

  const handleEditCase = async () => {
    if (!editPrompt.trim()) return;
    setLoadingState({ visible: true, message: "Initializing Case Transformation...", step: 'Step 1/2', stepDetail: 'Applying Edits' });
    try {
      const { updatedCase: editedCase, report: editReport } = await editCaseWithPrompt(draftCase, editPrompt, (msg) => {
        setLoadingState({ visible: true, message: msg, step: 'Step 1/2', stepDetail: 'Applying Edits' });
      }, baselineRef.current);
      setLoadingState({ visible: true, message: "Running full consistency audit...", step: 'Step 2/2', stepDetail: 'Consistency Check' });
      const { updatedCase, report: consistencyReport } = await checkCaseConsistency(editedCase, (msg) => {
        setLoadingState({ visible: true, message: msg, step: 'Step 2/2', stepDetail: 'Consistency Check' });
      }, draftCase, editPrompt);
      setConsistencyModal({ visible: true, report: consistencyReport, updatedCase, editReport, editPrompt });
      setEditPrompt('');
    } catch (e) {
      console.error("Case Transformation Failed:", e);
      toast.error('Failed to transform case.');
    } finally {
      setLoadingState({ visible: false, message: '' });
    }
  };

  const applyConsistencyChanges = () => {
    if (consistencyModal.updatedCase) {
      baselineRef.current = JSON.parse(JSON.stringify(consistencyModal.updatedCase));
      onUpdateDraft(consistencyModal.updatedCase);
    }
    setConsistencyModal({ visible: false, report: '', updatedCase: null });
    toast.success("Changes applied! Remember to click 'Save' to persist.");
  };

  const handlePreviewVoice = async () => {
    if (!activeSuspect || !activeSuspect.voice || activeSuspect.voice === 'None' || isPreviewingVoice) return;
    let currentChar: { name: string; role: string; voice: string } | undefined;
    if (selectedSuspectId === 'officer') currentChar = draftCase.officer as any;
    else if (selectedSuspectId === 'partner') currentChar = draftCase.partner as any;
    else currentChar = draftCase.suspects?.find(s => s.id === selectedSuspectId) as any;
    if (!currentChar || !currentChar.voice) return;

    setIsPreviewingVoice(true);
    try {
      const previewText = `My name is ${currentChar.name}. My role is ${currentChar.role}.`;
      const audioUrl = await generateTTS(previewText, currentChar.voice);
      if (audioUrl) {
        if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl);
        setVoicePreviewUrl(audioUrl);
        await playAudioFromUrl(audioUrl);
      } else {
        toast.error('Voice preview failed: No audio was returned.');
      }
    } catch (err) {
      console.error("Voice preview error:", err);
      toast.error(`Voice preview failed: ${(err as any)?.message || 'Could not generate audio preview.'}`);
    } finally {
      setIsPreviewingVoice(false);
    }
  };

  return (
    <Container ref={containerRef}>
      {loadingState.visible && (
        <Overlay>
          {loadingState.step && (
            <div style={{ color: '#666', fontSize: 'var(--type-small)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 'var(--space)' }}>
              {loadingState.step}
              {loadingState.stepDetail && <span style={{ color: '#888', marginLeft: 'var(--space)' }}>— {loadingState.stepDetail}</span>}
            </div>
          )}
          <Spinner />
          <LoadingText>{loadingState.message}</LoadingText>
          <div style={{ color: '#555', fontSize: 'var(--type-small)', maxWidth: '320px', textAlign: 'center', lineHeight: 1.5, marginTop: 'var(--space)' }}>
            Analyzing the full case narrative, evidence, timelines, and character relationships. This can take a few minutes.
          </div>
        </Overlay>
      )}

      {showCamera && (
        <CameraOverlay>
          <h2 style={{ color: '#0f0', textShadow: '0 0 10px #0f0' }}>SUBJECT ACQUISITION MODE</h2>
          <VideoPreview ref={videoRef} autoPlay playsInline muted />
          <CameraControls>
            <UtilityButton onClick={stopCamera} style={{ fontSize: 'var(--type-body-lg)', padding: '10px 30px' }}>CANCEL</UtilityButton>
            <SnapButton onClick={takePhoto} title="CAPTURE IMAGE" />
          </CameraControls>
        </CameraOverlay>
      )}

      {showSuspectEditor && activeSuspect && (
        <ImageEditorModal
          title={activeSuspect.portraits?.[Emotion.NEUTRAL] ? `Edit ${activeSuspect.name}` : `Create ${activeSuspect.name}`}
          initialImageUrl={activeSuspect.portraits?.[Emotion.NEUTRAL] || undefined}
          onClose={() => setShowSuspectEditor(false)}
          onSave={handleSaveEditedSuspect}
          aspectRatio="3:4"
        />
      )}

      {showHeroEditor && (
        <ImageEditorModal
          title="Generate Hero Image"
          initialImageUrl={draftCase.heroImageUrl || 'https://picsum.photos/seed/detective/800/450'}
          onClose={() => setShowHeroEditor(false)}
          onSave={handleSaveHeroImage}
          aspectRatio="16:9"
        />
      )}

      <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleImageUpload} />

      <MobileTabBar>
        <MobileTab $active={mobileTab === 'case'} onClick={() => setMobileTab('case')}>CASE DETAILS</MobileTab>
        <MobileTab $active={mobileTab === 'suspects'} onClick={() => setMobileTab('suspects')}>SUSPECTS</MobileTab>
      </MobileTabBar>

      <LeftColumn $mobileHidden={mobileTab !== 'case'}>
        <CaseDetailsPanel
          draftCase={draftCase}
          mobileTab={mobileTab}
          heroMode={heroMode}
          setHeroMode={setHeroMode}
          editPrompt={editPrompt}
          setEditPrompt={setEditPrompt}
          loadingVisible={loadingState.visible}
          onCaseChange={handleCaseChange}
          onRerollEvidence={handleRerollEvidence}
          onTransferEvidence={handleTransferEvidence}
          onEditCase={handleEditCase}
          onShowHeroEditor={() => setShowHeroEditor(true)}
          onPasteFromClipboard={handlePasteFromClipboard}
          onSave={handleSave}
          onCheckConsistency={handleCheckConsistency}
          onCancel={handleCancel}
          onStart={onStart}
        />
      </LeftColumn>

      <SuspectEditorPanel
        draftCase={draftCase}
        mobileTab={mobileTab}
        selectedSuspectId={selectedSuspectId}
        setSelectedSuspectId={setSelectedSuspectId}
        loadingVisible={loadingState.visible}
        isPreviewingVoice={isPreviewingVoice}
        onSuspectChange={handleSuspectChange}
        onAddSuspect={handleAddSuspect}
        onDeleteSuspect={handleDeleteSuspect}
        onRetryAI={handleRetryAI}
        onRerollPortrait={handleRerollPortrait}
        onShowSuspectEditor={() => setShowSuspectEditor(true)}
        onTriggerUpload={() => { if (fileInputRef.current) fileInputRef.current.click(); }}
        onPasteFromClipboard={handlePasteFromClipboard}
        onProcessSuspectImage={processSuspectImage}
        onStartCamera={startCamera}
        onPreviewVoice={handlePreviewVoice}
        onRerollEvidence={handleRerollEvidence}
        onTransferEvidence={handleTransferEvidence}
        onSave={handleSave}
        onCheckConsistency={handleCheckConsistency}
        onCancel={handleCancel}
        onStart={onStart}
      />

      {consistencyModal.visible && (
        <ConsistencyModal
          report={consistencyModal.report}
          editReport={consistencyModal.editReport}
          editPrompt={consistencyModal.editPrompt}
          updatedCase={consistencyModal.updatedCase}
          draftCase={draftCase}
          onApply={applyConsistencyChanges}
          onDiscard={() => setConsistencyModal({ visible: false, report: null, updatedCase: null })}
        />
      )}

      {suspectToDelete && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ background: '#111', padding: 'calc(var(--space) * 3)', border: '1px solid #333', maxWidth: '400px', width: '90%' }}>
            <h3 style={{ color: '#fff', marginTop: 0 }}>Delete Suspect</h3>
            <p style={{ color: '#ccc' }}>Are you sure you want to remove {suspectToDelete.name}?</p>
            <div style={{ display: 'flex', gap: 'var(--space)', marginTop: 'calc(var(--space) * 3)' }}>
              <SaveButton onClick={confirmDeleteSuspect} style={{ background: '#800' }}>Delete</SaveButton>
              <SaveButton onClick={() => setSuspectToDelete(null)}>Cancel</SaveButton>
            </div>
          </div>
        </div>
      )}

      {showCancelDialog && (
        <ExitCaseDialog
          onConfirm={() => { setShowCancelDialog(false); onCancel(); }}
          onCancel={() => setShowCancelDialog(false)}
          hasUnsavedChanges={hasUnsavedChanges}
        />
      )}
    </Container>
  );
};

export default CaseReview;
