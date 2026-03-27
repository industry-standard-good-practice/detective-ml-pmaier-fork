
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { type } from '../theme';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { X, Wand2, Save, Undo, AlertCircle, ImagePlus, ClipboardPaste, Upload, Camera, RefreshCw } from 'lucide-react';
import toast from '../services/appToast';
import { editImageWithPrompt, createImageFromPrompt } from '../services/geminiImages';
import Spinner from './Spinner';
import { HorizontalScrollStrip } from './HorizontalScrollStrip';
import type { PortraitVariantSlot } from '../utils/portraitVariantSlots';
import { singleVariantInFlightKeys, type ImageLoadingState } from './SuspectPortrait';
import { ModalBox, ModalTitle, ModalText, ModalButtonRow, Button as UiButton } from './ui';

const Overlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(var(--space) * 3);
`;

const Modal = styled.div`
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  width: 100%;
  max-width: 900px;
  max-height: 95%;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  position: relative;
  overflow: hidden;
`;

const Header = styled.div`
  padding: calc(var(--space) * 2) calc(var(--space) * 3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
`;

const Title = styled.h2`
  ${type.bodyLg}
  font-weight: 600;
  color: white;
  margin: 0;
`;

const CloseButton = styled.button`
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  padding: var(--space);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  margin-right: -8px;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }
`;

const Content = styled.div`
  padding: calc(var(--space) * 3);
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: calc(var(--space) * 3);
  overflow-y: auto;
  min-height: 0;

  @media (max-width: 850px) {
    grid-template-columns: 1fr;
  }
`;

const LeftColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: calc(var(--space) * 2);
  min-width: 0;
`;

const ImageContainer = styled.div`
  background: #000;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.05);
  max-height: 50vh;
`;

const PreviewImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
`;

const RegenAllOverlayButton = styled.button`
  position: absolute;
  bottom: calc(var(--space) * 2);
  right: calc(var(--space) * 2);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(59, 130, 246, 0.9);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  cursor: pointer;
  font-size: var(--type-small);
  font-weight: 600;
  z-index: 5;
  font-family: inherit;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  &:hover:not(:disabled) {
    background: #2563eb;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const VariantThumb = styled.button<{ $active: boolean; $slotStatus?: 'idle' | 'loading' | 'done' }>`
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  padding: 0;
  border: 2px solid
    ${(p) =>
      p.$slotStatus === 'loading'
        ? '#3b82f6'
        : p.$slotStatus === 'done'
          ? 'rgba(34, 197, 94, 0.55)'
          : p.$active
            ? '#3b82f6'
            : 'rgba(255,255,255,0.12)'};
  background: #0a0a0a;
  cursor: pointer;
  overflow: hidden;
  position: relative;
  border-radius: 2px;
  opacity: ${(p) => (p.$slotStatus === 'idle' ? 0.5 : 1)};
  &:hover {
    border-color: ${(p) =>
      p.$slotStatus === 'loading'
        ? '#60a5fa'
        : p.$slotStatus === 'done'
          ? 'rgba(34, 197, 94, 0.75)'
          : p.$active
            ? '#3b82f6'
            : 'rgba(255,255,255,0.35)'};
  }
`;

const VariantThumbSpinnerWrap = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  pointer-events: none;
`;

const VariantThumbImg = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  image-rendering: pixelated;
`;

const VariantThumbLabel = styled.span`
  display: block;
  font-size: 9px;
  color: rgba(255, 255, 255, 0.45);
  text-align: center;
  margin-top: 4px;
  max-width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const VariantThumbWrap = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
`;

const VariantPlaceholder = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.25);
  font-size: 10px;
  text-transform: uppercase;
`;

const Controls = styled.div`
  display: flex;
  flex-direction: column;
  gap: calc(var(--space) * 2);
  min-height: 0;
`;

const InputGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space);
  flex: 1;
  min-height: 0;
`;

const Label = styled.label`
  ${type.small}
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const TextArea = styled.textarea`
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: calc(var(--space) * 2);
  color: white;
  ${type.body}
  resize: none;
  flex: 1;
  min-height: 100px;
  transition: all 0.2s;
  line-height: 1.5;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    background: rgba(255, 255, 255, 0.06);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }

  &::placeholder {
    color: rgba(255, 255, 255, 0.2);
  }
`;

const PromptToolbar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space);
  margin-top: calc(var(--space) * -1);
  padding-top: var(--space);
`;

const SourceRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--space) * 1.5);
`;

const SourceButton = styled.button`
  flex: 1;
  min-width: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.85);
  font-size: var(--type-small);
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  transition: all 0.2s;
  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.22);
  }
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: calc(var(--space) * 2);
  flex-shrink: 0;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' }>`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space);
  padding: calc(var(--space) * 2) calc(var(--space) * 2);
  font-weight: 600;
  ${type.small}
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
  white-space: nowrap;

  ${(props) =>
    props.$variant === 'primary'
      ? `
    background: #3b82f6;
    color: white;
    &:hover:not(:disabled) { background: #2563eb; }
  `
      : props.$variant === 'danger'
        ? `
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    &:hover:not(:disabled) { background: rgba(239, 68, 68, 0.2); }
  `
        : `
    background: rgba(255, 255, 255, 0.05);
    color: white;
    &:hover:not(:disabled) { background: rgba(255, 255, 255, 0.1); }
  `}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const LoadingOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(var(--space) * 2);
  color: white;
  z-index: 10;
  padding: calc(var(--space) * 3);
  text-align: center;
`;

const ProgressBar = styled.div`
  width: 100%;
  max-width: 200px;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
  margin-top: var(--space);
`;

const ProgressFill = styled(motion.div)`
  height: 100%;
  background: #3b82f6;
  box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
`;

const HiddenFileInput = styled.input`
  display: none;
`;

/** Plain div — avoid `styled(styled.div)` on the shared Overlay (can crash styled-components in some builds). */
const DiscardOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 11000;
  background: var(--color-surface-overlay-heavy);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: calc(var(--space) * 2.5);
`;

export interface ImageEditorModalProps {
  initialImageUrl?: string;
  onSave: (
    newImageUrl: string,
    onProgress?: (current: number, total: number) => void,
    meta?: { variantKey?: string }
  ) => Promise<void>;
  onClose: () => void;
  /**
   * When the modal is busy (generate / save / regen), the default is to block closing.
   * If set, closing (X, backdrop, Escape) while busy calls this instead—typically hide the overlay
   * while the component stays mounted so work can finish (see parent keep-alive).
   */
  onCloseWhileBusy?: () => void;
  /** Portrait mode: parent has regen / staged URLs not yet written to the case draft. */
  portraitSessionHasRemoteChanges?: boolean;
  /** When false, the modal is hidden but stays mounted so in-flight generation can finish. */
  visible?: boolean;
  /** Fires when generate/save/regenerate-all busy state changes (for parent loading UI + keep-alive). */
  onBusyChange?: (
    busy: boolean,
    meta?: {
      regenerateAll?: boolean;
      regenerateVariant?: boolean;
      saving?: boolean;
      /** Portrait mode: which variant is being nano-edited (for carousel thumb loading). */
      generatingVariantKey?: string;
    }
  ) => void;
  aspectRatio?: string;
  title?: string;
  /** Suspect/partner/officer: portrait variant carousel + per-key save */
  portraitSlots?: PortraitVariantSlot[];
  portraitUrls?: Record<string, string | undefined>;
  /** When neutral + portrait mode, regenerate every variant from current neutral */
  onRegenerateAllVariants?: (neutralDataUrl: string, onProgress?: (current: number, total: number) => void) => Promise<void>;
  /** When a non-neutral variant is selected, regenerate only that slot from the neutral portrait */
  onRegenerateVariant?: (neutralDataUrl: string, variantKey: string) => Promise<void>;
  /** Paste from system clipboard into this variant */
  onPasteFromClipboard?: (callback: (dataUrl: string) => void) => void;
  /** Open camera capture; call onCaptured with captured still */
  onRequestCamera?: (onCaptured: (dataUrl: string) => void) => void;
  /** Parent-driven portrait work (reroll, background gen) — show progress and lock edits until cleared. */
  externalPortraitLoading?: ImageLoadingState | null;
  /** Per carousel slot when portraits are loading (reroll, regen variants, nano edit, etc.). */
  variantSlotStatus?: Record<string, 'idle' | 'loading' | 'done'> | null;
}

const NEUTRAL_KEY = 'NEUTRAL';

const ImageEditorModal: React.FC<ImageEditorModalProps> = ({
  initialImageUrl,
  onSave,
  onClose,
  onCloseWhileBusy,
  portraitSessionHasRemoteChanges = false,
  visible = true,
  onBusyChange,
  aspectRatio = '3:4',
  title = 'Edit Image',
  portraitSlots,
  portraitUrls,
  onRegenerateAllVariants,
  onRegenerateVariant,
  onPasteFromClipboard,
  onRequestCamera,
  externalPortraitLoading = null,
  variantSlotStatus = null,
}) => {
  const onBusyChangeRef = useRef(onBusyChange);
  onBusyChangeRef.current = onBusyChange;
  const portraitMode = Boolean(portraitSlots?.length);
  const [selectedVariantKey, setSelectedVariantKey] = useState(() => portraitSlots?.[0]?.key ?? NEUTRAL_KEY);

  const [currentImageUrl, setCurrentImageUrl] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegeneratingAll, setIsRegeneratingAll] = useState(false);
  /** Portrait slots with an in-flight "regen variant" started from this modal (concurrent slots allowed). */
  const [variantRegenInFlight, setVariantRegenInFlight] = useState<string[]>([]);
  const [savingProgress, setSavingProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Canonical image URL/string for the selected slot after load; local edits compare against this. */
  const canvasSessionBaselineRef = useRef<string>('');

  const urlForSelectedVariant = portraitMode ? portraitUrls?.[selectedVariantKey] : initialImageUrl;
  const neutralPortraitUrl = portraitMode ? portraitUrls?.[NEUTRAL_KEY] : undefined;

  const extSingleVariantKeys = singleVariantInFlightKeys(externalPortraitLoading);
  const extModalBlocking =
    externalPortraitLoading === 'waiting' ||
    externalPortraitLoading === 'generating' ||
    (externalPortraitLoading != null &&
      typeof externalPortraitLoading === 'object' &&
      (externalPortraitLoading.kind === 'variants' || externalPortraitLoading.kind === 'reroll'));
  const anyPortraitSlotVariantBusy =
    variantRegenInFlight.length > 0 || extSingleVariantKeys.length > 0;
  const selectedSlotVariantRegenerating =
    variantRegenInFlight.includes(selectedVariantKey) ||
    extSingleVariantKeys.includes(selectedVariantKey);

  const showPreviewBusyOverlay =
    isGenerating ||
    isSaving ||
    isRegeneratingAll ||
    selectedSlotVariantRegenerating ||
    extModalBlocking;

  const applyDataUrlToCanvas = useCallback((dataUrl: string) => {
    setHistory((prev) => [...prev, dataUrl]);
    setCurrentImageUrl(dataUrl);
    setError(null);
  }, []);

  const fetchRemoteAsDataUrl = useCallback(async (url: string): Promise<string | null> => {
    if (url.startsWith('data:')) return url;
    if (url.startsWith('http')) {
      try {
        const response = await fetch(`/api/proxy-image?url=${encodeURIComponent(url)}`);
        if (response.ok) {
          const data = await response.json();
          if (data.base64) return data.base64 as string;
        }
      } catch (err) {
        console.warn('Could not proxy image for CORS-safe editing', err);
      }
    }
    return null;
  }, []);

  // Load image when variant changes or source URL updates (hero or portrait)
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const src = portraitMode ? urlForSelectedVariant : initialImageUrl;
      if (!src) {
        if (!cancelled) {
          canvasSessionBaselineRef.current = '';
          setCurrentImageUrl('');
          setHistory([]);
        }
        return;
      }
      if (src.startsWith('data:')) {
        if (!cancelled) {
          canvasSessionBaselineRef.current = src;
          setCurrentImageUrl(src);
          setHistory([src]);
        }
        return;
      }
      const prepared = await fetchRemoteAsDataUrl(src);
      if (!cancelled) {
        if (prepared) {
          canvasSessionBaselineRef.current = prepared;
          setCurrentImageUrl(prepared);
          setHistory([prepared]);
        } else {
          canvasSessionBaselineRef.current = src;
          setCurrentImageUrl(src);
          setHistory([src]);
        }
      }
    };
    run();
    setPrompt('');
    setError(null);
    return () => {
      cancelled = true;
    };
  }, [selectedVariantKey, portraitMode, urlForSelectedVariant, initialImageUrl, fetchRemoteAsDataUrl]);

  useEffect(() => {
    const busy = isGenerating || isSaving || isRegeneratingAll || variantRegenInFlight.length > 0;
    onBusyChangeRef.current?.(busy, {
      regenerateAll: isRegeneratingAll,
      regenerateVariant: variantRegenInFlight.length > 0,
      saving: isSaving,
      generatingVariantKey:
        portraitMode && isGenerating && !isRegeneratingAll && variantRegenInFlight.length === 0
          ? selectedVariantKey
          : undefined,
    });
  }, [isGenerating, isSaving, isRegeneratingAll, variantRegenInFlight.length, portraitMode, selectedVariantKey]);

  /** Clearing busy on unmount avoids stale regen/generate flags when the parent remounts this modal for another character (see CaseReview `key={selectedSuspectId}`). */
  useEffect(() => {
    return () => {
      onBusyChangeRef.current?.(false, {});
    };
  }, []);

  const tryRequestClose = useCallback(() => {
    if (!visible) return;
    if (showPreviewBusyOverlay) {
      if (onCloseWhileBusy) {
        onCloseWhileBusy();
        return;
      }
      toast.error('Wait for the current operation to finish before closing.');
      return;
    }
    const canvasDirty = currentImageUrl !== canvasSessionBaselineRef.current;
    if (canvasDirty || portraitSessionHasRemoteChanges) {
      setDiscardDialogOpen(true);
      return;
    }
    onClose();
  }, [visible, showPreviewBusyOverlay, onCloseWhileBusy, currentImageUrl, portraitSessionHasRemoteChanges, onClose]);

  useEffect(() => {
    if (!visible) setDiscardDialogOpen(false);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (discardDialogOpen) {
        setDiscardDialogOpen(false);
        return;
      }
      tryRequestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, discardDialogOpen, tryRequestClose]);

  const handlePasteFromClipboard = async () => {
    if (!onPasteFromClipboard) {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            const reader = new FileReader();
            reader.onload = (e) => {
              const base64 = e.target?.result as string;
              if (base64) {
                applyDataUrlToCanvas(base64);
                toast.success('Image pasted from clipboard!');
              }
            };
            reader.readAsDataURL(blob);
            return;
          }
        }
        toast.error('No image found on clipboard.');
      } catch (err: any) {
        console.error('Clipboard paste failed:', err);
        toast.error(err?.name === 'NotAllowedError' ? 'Clipboard access denied.' : 'Could not read clipboard.');
      }
      return;
    }
    onPasteFromClipboard((dataUrl) => {
      applyDataUrlToCanvas(dataUrl);
      toast.success('Image pasted from clipboard!');
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (ev) => {
      const r = ev.target?.result as string;
      if (r) {
        applyDataUrlToCanvas(r);
        toast.success('Image loaded.');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleTakePhoto = () => {
    if (!onRequestCamera) {
      toast.error('Camera is not available in this context.');
      return;
    }
    onRequestCamera((dataUrl) => {
      applyDataUrlToCanvas(dataUrl);
      toast.success('Photo captured.');
    });
  };

  const getBase64FromImage = (): string | null => {
    if (!imageRef.current) return null;
    if (currentImageUrl.startsWith('data:')) return currentImageUrl;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = imageRef.current.naturalWidth;
      canvas.height = imageRef.current.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(imageRef.current, 0, 0);
      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  };

  const handleEdit = async () => {
    if (!prompt.trim() || isGenerating || isSaving || isRegeneratingAll || extModalBlocking) return;
    setError(null);
    setIsGenerating(true);
    try {
      let result: string | null = null;
      if (!currentImageUrl) {
        result = await createImageFromPrompt(prompt, aspectRatio);
      } else {
        const base64 = getBase64FromImage();
        if (!base64) {
          setError('Could not process image for editing. This might be a cross-origin issue.');
          setIsGenerating(false);
          return;
        }
        result = await editImageWithPrompt(base64, prompt, aspectRatio);
      }
      if (result) {
        setHistory((prev) => [...prev, result!]);
        setCurrentImageUrl(result);
        setPrompt('');
      } else {
        setError(
          !currentImageUrl
            ? 'Failed to generate image. Try a different description.'
            : 'Failed to edit image. The AI might have had trouble with your prompt.'
        );
      }
    } catch (err: any) {
      console.error(err);
      const errorMsg = err?.message || 'An unexpected error occurred while editing.';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (isSaving || isGenerating || isRegeneratingAll || extModalBlocking) return;
    if (!currentImageUrl) return;
    setIsSaving(true);
    try {
      await onSave(
        currentImageUrl,
        (current, total) => setSavingProgress({ current, total }),
        portraitMode ? { variantKey: selectedVariantKey } : undefined
      );
    } catch (err: any) {
      console.error(err);
      const errorMsg = err?.message || 'Failed to save changes.';
      toast.error(`Save failed: ${errorMsg}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerateAll = async () => {
    if (
      !onRegenerateAllVariants ||
      selectedVariantKey !== NEUTRAL_KEY ||
      !currentImageUrl ||
      isRegeneratingAll ||
      anyPortraitSlotVariantBusy ||
      isSaving ||
      isGenerating ||
      extModalBlocking
    )
      return;
    const base64 = getBase64FromImage();
    if (!base64) {
      toast.error('Could not read neutral image for regeneration.');
      return;
    }
    setIsRegeneratingAll(true);
    setSavingProgress({ current: 0, total: 0 });
    setError(null);
    try {
      await onRegenerateAllVariants(base64, (current, total) => setSavingProgress({ current, total }));
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Regeneration failed.');
    } finally {
      setIsRegeneratingAll(false);
    }
  };

  const handleRegenerateVariant = async () => {
    const slotKey = selectedVariantKey;
    if (
      !onRegenerateVariant ||
      slotKey === NEUTRAL_KEY ||
      !neutralPortraitUrl ||
      variantRegenInFlight.includes(slotKey) ||
      extSingleVariantKeys.includes(slotKey) ||
      isRegeneratingAll ||
      isSaving ||
      isGenerating ||
      extModalBlocking
    ) {
      return;
    }
    setVariantRegenInFlight((prev) => [...new Set([...prev, slotKey])]);
    setError(null);
    try {
      let neutralDataUrl: string;
      if (neutralPortraitUrl.startsWith('data:')) {
        neutralDataUrl = neutralPortraitUrl;
      } else {
        const prepared = await fetchRemoteAsDataUrl(neutralPortraitUrl);
        if (!prepared) {
          toast.error('Could not load the neutral portrait for regeneration.');
          return;
        }
        neutralDataUrl = prepared;
      }
      await onRegenerateVariant(neutralDataUrl, slotKey);
    } catch (err: any) {
      console.error(err);
    } finally {
      setVariantRegenInFlight((prev) => prev.filter((k) => k !== slotKey));
    }
  };

  const handleUndo = () => {
    if (history.length <= 1 || isSaving || isGenerating || isRegeneratingAll || extModalBlocking) return;
    const newHistory = [...history];
    newHistory.pop();
    setHistory(newHistory);
    setCurrentImageUrl(newHistory[newHistory.length - 1]);
  };

  const showRegenAll =
    portraitMode && onRegenerateAllVariants && selectedVariantKey === NEUTRAL_KEY && Boolean(currentImageUrl);

  const showRegenVariant =
    portraitMode &&
    onRegenerateVariant &&
    selectedVariantKey !== NEUTRAL_KEY &&
    Boolean(neutralPortraitUrl);

  /** Locks nano-edit / save / undo / source — not single-variant regen of other slots. */
  const pipelineLocked = isGenerating || isSaving || isRegeneratingAll || extModalBlocking;
  const regenRemaining =
    isRegeneratingAll && savingProgress.total > 0 ? Math.max(0, savingProgress.total - savingProgress.current) : null;

  const externalBlockingOnlyMessage =
    extModalBlocking && externalPortraitLoading
      ? externalPortraitLoading === 'waiting'
        ? 'Waiting in queue…'
        : externalPortraitLoading === 'generating'
          ? 'Regenerating portrait…'
          : externalPortraitLoading != null &&
              typeof externalPortraitLoading === 'object' &&
              externalPortraitLoading.kind === 'variants'
            ? externalPortraitLoading.total > 0
              ? `Regenerating variants… ${externalPortraitLoading.total - externalPortraitLoading.remaining} / ${externalPortraitLoading.total}`
              : 'Regenerating variants…'
            : externalPortraitLoading != null &&
                typeof externalPortraitLoading === 'object' &&
                externalPortraitLoading.kind === 'reroll'
              ? externalPortraitLoading.statusMessage || 'Working…'
              : 'Working…'
      : null;

  const previewOverlayPrimaryMessage = isGenerating
    ? 'Nano Banana is working...'
    : isSaving
      ? 'Saving...'
      : isRegeneratingAll
        ? regenRemaining !== null && regenRemaining > 0
          ? `Regenerating variants… ${regenRemaining} left`
          : 'Regenerating variants…'
        : externalBlockingOnlyMessage ??
          (selectedSlotVariantRegenerating ? 'Regenerating variant…' : '');

  return (
    <>
      <Overlay
        onClick={tryRequestClose}
        style={!visible ? { visibility: 'hidden', pointerEvents: 'none' } : undefined}
      >
        <Modal onClick={(e) => e.stopPropagation()}>
          <Header>
            <Title>
              {portraitMode
                ? `${title} — ${portraitSlots!.find((s) => s.key === selectedVariantKey)?.label ?? selectedVariantKey}`
                : title}
            </Title>
            <CloseButton onClick={tryRequestClose} type="button">
              <X size={20} />
            </CloseButton>
          </Header>

          <Content>
            <LeftColumn>
              <ImageContainer style={{ aspectRatio }}>
                {currentImageUrl ? (
                  <PreviewImage ref={imageRef} src={currentImageUrl} alt="Preview" referrerPolicy="no-referrer" />
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 'calc(var(--space) * 2)',
                      color: 'rgba(255,255,255,0.3)',
                      padding: 'calc(var(--space) * 5)',
                      textAlign: 'center',
                    }}
                  >
                    <ImagePlus size={48} />
                    <span style={{ fontSize: 'var(--type-small)' }}>
                      {!portraitMode && !initialImageUrl
                        ? 'Describe the image below or add a source image.'
                        : 'No image for this variant yet — use Upload, Paste, or Photo.'}
                    </span>
                  </div>
                )}
                {showRegenAll && (
                  <RegenAllOverlayButton
                    type="button"
                    onClick={handleRegenerateAll}
                    disabled={pipelineLocked || anyPortraitSlotVariantBusy}
                    title="Regenerate all emotional / examination variants from this neutral image"
                  >
                    <RefreshCw size={14} />
                    Regen all
                  </RegenAllOverlayButton>
                )}
                {showRegenVariant && (
                  <RegenAllOverlayButton
                    type="button"
                    onClick={handleRegenerateVariant}
                    disabled={pipelineLocked || selectedSlotVariantRegenerating}
                    title="Regenerate only this variant from the neutral portrait"
                  >
                    <RefreshCw size={14} />
                    Regen variant
                  </RegenAllOverlayButton>
                )}
                {showPreviewBusyOverlay && (
                  <LoadingOverlay>
                    <Spinner $size={32} $color="#3b82f6" />
                    <span>{previewOverlayPrimaryMessage}</span>
                    {savingProgress.total > 0 && (isSaving || isRegeneratingAll) && (
                      <>
                        <span style={{ fontSize: 'var(--type-small)', opacity: 0.8 }}>
                          {savingProgress.current} / {savingProgress.total}
                        </span>
                        <ProgressBar>
                          <ProgressFill
                            initial={{ width: 0 }}
                            animate={{ width: `${(savingProgress.current / savingProgress.total) * 100}%` }}
                          />
                        </ProgressBar>
                      </>
                    )}
                  </LoadingOverlay>
                )}
              </ImageContainer>

              {portraitMode && portraitSlots && (
                <HorizontalScrollStrip>
                  {portraitSlots.map((slot) => {
                    const u = portraitUrls?.[slot.key];
                    const active = slot.key === selectedVariantKey;
                    const slotStatus = variantSlotStatus?.[slot.key];
                    return (
                      <VariantThumbWrap key={slot.key}>
                        <VariantThumb
                          type="button"
                          $active={active}
                          $slotStatus={slotStatus}
                          onClick={() => setSelectedVariantKey(slot.key)}
                          title={slot.label}
                        >
                          {u ? <VariantThumbImg src={u} alt="" /> : <VariantPlaceholder>?</VariantPlaceholder>}
                          {slotStatus === 'loading' && (
                            <VariantThumbSpinnerWrap>
                              <Spinner $size={22} $color="#3b82f6" />
                            </VariantThumbSpinnerWrap>
                          )}
                        </VariantThumb>
                        <VariantThumbLabel>{slot.label}</VariantThumbLabel>
                      </VariantThumbWrap>
                    );
                  })}
                </HorizontalScrollStrip>
              )}
            </LeftColumn>

            <Controls>
              <InputGroup>
                <Label>{currentImageUrl ? 'What would you like to change?' : 'Describe the image to generate'}</Label>
                <TextArea
                  placeholder={
                    currentImageUrl
                      ? "e.g., 'Change his hair to red', 'Add a scar over his left eye', 'Make her wear a detective hat'..."
                      : "e.g., 'A stern female detective with short gray hair, wearing a trench coat'..."
                  }
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={pipelineLocked}
                />
                <PromptToolbar>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <Button
                      type="button"
                      onClick={handleUndo}
                      disabled={pipelineLocked || history.length <= 1}
                      style={{ flex: 'none', padding: '8px 14px', fontSize: 'var(--type-small)' }}
                    >
                      <Undo size={14} />
                      Undo
                    </Button>
                  </div>
                  <Button
                    type="button"
                    $variant="primary"
                    onClick={handleEdit}
                    disabled={pipelineLocked || !prompt.trim()}
                    style={{ flex: 'none', width: '48px', height: '40px', padding: 0 }}
                    title="Generate"
                  >
                    <Wand2 size={16} />
                  </Button>
                </PromptToolbar>
              </InputGroup>

              <SourceRow>
                <SourceButton type="button" onClick={() => fileInputRef.current?.click()} disabled={pipelineLocked}>
                  <Upload size={14} />
                  Upload
                </SourceButton>
                <SourceButton type="button" onClick={handlePasteFromClipboard} disabled={pipelineLocked}>
                  <ClipboardPaste size={14} />
                  Paste
                </SourceButton>
                <SourceButton type="button" onClick={handleTakePhoto} disabled={pipelineLocked || !onRequestCamera}>
                  <Camera size={14} />
                  Photo
                </SourceButton>
              </SourceRow>

              <HiddenFileInput ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} />

              {error && (
                <div
                  style={{
                    color: '#ef4444',
                    fontSize: 'var(--type-small)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space)',
                  }}
                >
                  <AlertCircle size={14} />
                  {error}
                </div>
              )}

              <ButtonGroup>
                <Button $variant="danger" onClick={tryRequestClose} type="button">
                  Revert
                </Button>
                <Button type="button" $variant="primary" onClick={handleSave} disabled={pipelineLocked || !currentImageUrl}>
                  <Save size={16} />
                  Save Edit
                </Button>
              </ButtonGroup>
            </Controls>
          </Content>
        </Modal>
      </Overlay>

      {discardDialogOpen && (
        <DiscardOverlay
          onClick={() => setDiscardDialogOpen(false)}
          role="presentation"
        >
          <ModalBox onClick={(e) => e.stopPropagation()} $borderColor="rgba(255, 170, 0, 0.45)" $glowColor="rgba(255, 170, 0, 0.15)">
            <ModalTitle $color="var(--color-accent-orange)">Revert changes?</ModalTitle>
            <ModalText style={{ color: 'var(--color-text-muted)', fontSize: 'var(--type-body)' }}>
              This undoes unsaved edits in this session (e.g. nano-generate / paste not yet saved with Save Edit) and
              restores portrait URLs from the case.
            </ModalText>
            <ModalButtonRow>
              <UiButton type="button" $variant="ghost" onClick={() => setDiscardDialogOpen(false)}>
                Keep editing
              </UiButton>
              <UiButton
                type="button"
                $variant="danger"
                onClick={() => {
                  setDiscardDialogOpen(false);
                  onClose();
                }}
              >
                Revert
              </UiButton>
            </ModalButtonRow>
          </ModalBox>
        </DiscardOverlay>
      )}
    </>
  );
};

export default ImageEditorModal;
