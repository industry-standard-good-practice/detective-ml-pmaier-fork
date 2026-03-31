import { useState, useEffect, useRef, useCallback } from 'react';
import { CaseData } from '../types';
import { fetchCase } from '../services/persistence';

const POLL_INTERVAL_MS = 2000; // Poll every 2 seconds

export interface CasePollingState {
  /** The latest case data from the server (null until first successful fetch) */
  caseData: CaseData | null;
  /** Current generation status */
  status: CaseData['status'] | null;
  /** Whether polling is actively running */
  isPolling: boolean;
  /** True once status has transitioned to 'completed' */
  isComplete: boolean;
  /** True if status is 'failed' */
  isFailed: boolean;
  /** Error message if generation failed */
  error: string | null;
  /** Progress indicators derived from the case data */
  progress: {
    hasTitle: boolean;
    hasSuspects: boolean;
    suspectCount: number;
    hasEvidence: boolean;
    evidenceCount: number;
    hasTimeline: boolean;
    timelineCount: number;
    hasOfficer: boolean;
    hasPartner: boolean;
    hasImages: boolean;
    progressPercent: number;
  };
}

/**
 * React hook that polls a case by ID during async generation.
 * Automatically stops polling when the case reaches 'completed' or 'failed' status.
 * 
 * @param caseId - The case ID to poll (null/empty to disable)
 * @param enabled - Whether polling should be active
 * @returns CasePollingState with progressive updates
 */
export function useCasePolling(
  caseId: string | null,
  enabled: boolean = true
): CasePollingState {
  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Derive progress from case data
  const progress = {
    hasTitle: !!(caseData?.title && caseData.title.trim() !== ''),
    hasSuspects: (caseData?.suspects?.length ?? 0) > 0,
    suspectCount: caseData?.suspects?.length ?? 0,
    hasEvidence: (caseData?.initialEvidence?.length ?? 0) > 0,
    evidenceCount: caseData?.initialEvidence?.length ?? 0,
    hasTimeline: (caseData?.initialTimeline?.length ?? 0) > 0,
    timelineCount: caseData?.initialTimeline?.length ?? 0,
    hasOfficer: !!(caseData?.officer?.name),
    hasPartner: !!(caseData?.partner?.name),
    hasImages: !!(caseData?.suspects?.some(s => s.portraits && Object.keys(s.portraits).length > 0)),
    progressPercent: (caseData as any)?.progress ?? 0,
  };

  const status = caseData?.status ?? null;

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const poll = useCallback(async () => {
    if (!caseId) return;
    try {
      const data = await fetchCase(caseId);
      if (!mountedRef.current) return;
      if (!data) return;

      setCaseData(data);

      const currentStatus = data.status;
      if (currentStatus === 'completed' || !currentStatus) {
        setIsComplete(true);
        setIsFailed(false);
        setError(null);
        stopPolling();
      } else if (currentStatus === 'failed') {
        setIsFailed(true);
        setError(data.generationError || 'Case generation failed.');
        stopPolling();
      }
    } catch (e: any) {
      console.warn('[useCasePolling] Poll error:', e?.message);
      // Don't stop polling on transient network errors
    }
  }, [caseId, stopPolling]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    // Reset state when caseId changes
    if (!caseId || !enabled) {
      stopPolling();
      if (!caseId) {
        setCaseData(null);
        setIsComplete(false);
        setIsFailed(false);
        setError(null);
      }
      return;
    }

    // Start polling
    setIsPolling(true);
    setIsComplete(false);
    setIsFailed(false);
    setError(null);

    // Immediate first poll
    poll();

    // Set up interval
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      stopPolling();
    };
  }, [caseId, enabled, poll, stopPolling]);

  return {
    caseData,
    status,
    isPolling,
    isComplete,
    isFailed,
    error,
    progress,
  };
}
