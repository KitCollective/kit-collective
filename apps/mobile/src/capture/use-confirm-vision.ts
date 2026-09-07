import type { VisionFieldPreselect, VisionJobResponse } from "@kit/api-contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated } from "react-native";
import { fetchClubSeasons } from "@/api/catalog";
import { fetchVisionJob, startVisionSuggest } from "@/api/vision";
import {
  applyIdentitySuggestion,
  selectDraftKitType,
  setDraftClub,
  setDraftSeason,
} from "@/capture/captureSession";
import type { CaptureJerseyDraft, CaptureSessionMutator } from "@/capture/captureSessionTypes";
import {
  confirmClubWasEdited,
  confirmKitTypeWasEdited,
  confirmSeasonWasEdited,
  resetConfirmManualEdits,
} from "@/capture/confirmManualEdits";
import { resolveConfirmVisionBannerState } from "@/capture/confirmVisionBanner";
import { draftPhotoFingerprint } from "@/capture/confirmVisionScope";
import { buildIdentitySuggestRequest } from "@/capture/identitySuggestRequest";
import { buildSuggestOnlyVisionJob } from "@/capture/identitySuggestOnly";
import { motion } from "@/theme/tokens";

const VISION_TIMEOUT_MS = 12_000;
const VISION_POLL_INTERVAL_MS = 2_000;
const VISION_IDENTITY_DEBOUNCE_MS = 500;

type UseConfirmVisionOptions = {
  accessToken: string | null;
  sessionId: string | undefined;
  draft: CaptureJerseyDraft | null;
  mutate: CaptureSessionMutator;
  reduceMotion: boolean;
  jobId: string | null;
  setJobId: (jobId: string | null) => void;
  setSelectedSeasonLabel: (label: string | null) => void;
  onCatalogMiss?: (miss: boolean) => void;
};

function hasPreselectFields(fieldPreselect: VisionFieldPreselect | undefined): boolean {
  return Boolean(fieldPreselect?.club || fieldPreselect?.season || fieldPreselect?.type);
}

function hasSuggestFields(job: VisionJobResponse): boolean {
  return Boolean(
    job.suggestions?.clubId ||
      job.suggestions?.seasonId ||
      job.suggestions?.type ||
      job.catalogMiss,
  );
}

/**
 * Keeps optional Vision work behind one interface. It owns job start/poll/apply state;
 * callers only render the resolved banner and invoke the returned suggestion actions.
 */
export function useConfirmVision({
  accessToken,
  sessionId,
  draft,
  mutate,
  reduceMotion,
  jobId,
  setJobId,
  setSelectedSeasonLabel,
  onCatalogMiss,
}: UseConfirmVisionOptions) {
  const [polling, setPolling] = useState(false);
  const [suggestion, setSuggestion] = useState<VisionJobResponse | null>(null);
  const [applied, setApplied] = useState(false);
  const suggestionOpacity = useRef(new Animated.Value(0)).current;
  const appliedJobId = useRef<string | null>(null);
  const startAttempted = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const prevScopeRef = useRef<{ draftId: string | null; photoFingerprint: string | null }>({
    draftId: null,
    photoFingerprint: null,
  });

  const fadeInSuggestion = useCallback(() => {
    suggestionOpacity.setValue(reduceMotion ? 1 : 0);
    if (reduceMotion) {
      return;
    }
    Animated.timing(suggestionOpacity, {
      toValue: 1,
      duration: motion.fast,
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, suggestionOpacity]);

  const applySuggestions = useCallback(
    async (job: VisionJobResponse) => {
      if (job.status !== "ready" || !sessionId) {
        return;
      }

      const currentDraft = draftRef.current;
      if (!currentDraft) {
        return;
      }

      onCatalogMiss?.(job.catalogMiss === true);

      if (job.catalogMiss && !job.suggestions) {
        return;
      }

      const fieldPreselect = job.fieldPreselect ?? {};
      const suggestions = job.suggestions;
      const shouldPreselect = hasPreselectFields(fieldPreselect);

      if (!shouldPreselect && suggestions) {
        setSuggestion(job);
        fadeInSuggestion();
        return;
      }

      if (!shouldPreselect && !hasSuggestFields(job)) {
        return;
      }

      if (suggestions) {
        mutate((current) =>
          applyIdentitySuggestion(current, current.activeDraftId, suggestions, {
            fieldPreselect,
            manualEdits: {
              club: confirmClubWasEdited(),
              season: confirmSeasonWasEdited(),
              type: confirmKitTypeWasEdited(),
            },
          }),
        );

        if (!confirmSeasonWasEdited() && suggestions.seasonLabel && fieldPreselect.season) {
          setSelectedSeasonLabel(suggestions.seasonLabel);
        }

        if (!confirmSeasonWasEdited() && suggestions.clubId && accessToken && fieldPreselect.club) {
          await fetchClubSeasons(accessToken, suggestions.clubId);
        }

        const suggestOnlyJob = buildSuggestOnlyVisionJob(job, {
          club: confirmClubWasEdited(),
          season: confirmSeasonWasEdited(),
          type: confirmKitTypeWasEdited(),
        });
        if (suggestOnlyJob) {
          setSuggestion(suggestOnlyJob);
          fadeInSuggestion();
          return;
        }

        setApplied(true);
        fadeInSuggestion();
      }
    },
    [accessToken, fadeInSuggestion, mutate, onCatalogMiss, sessionId, setSelectedSeasonLabel],
  );

  const draftId = draft?.id ?? null;
  const photoFingerprint = draftPhotoFingerprint(draft);

  useEffect(() => {
    const prev = prevScopeRef.current;
    const draftChanged = prev.draftId !== draftId;
    const photosChanged = prev.photoFingerprint !== photoFingerprint;
    prevScopeRef.current = { draftId, photoFingerprint };

    if (!accessToken || !draftId || !photoFingerprint) {
      return;
    }

    if (draftChanged) {
      setJobId(null);
      setPolling(false);
      setSuggestion(null);
      setApplied(false);
      startAttempted.current = false;
      appliedJobId.current = null;
      resetConfirmManualEdits();
      setSelectedSeasonLabel(null);
      onCatalogMiss?.(false);
    } else if (!photosChanged) {
      return;
    } else {
      setJobId(null);
      setPolling(false);
      setSuggestion(null);
      setApplied(false);
      startAttempted.current = false;
      appliedJobId.current = null;
      onCatalogMiss?.(false);
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const currentDraft = draftRef.current;
        if (!currentDraft || startAttempted.current) {
          return;
        }
        startAttempted.current = true;
        try {
          const payload = await buildIdentitySuggestRequest(currentDraft);
          const nextJobId = await startVisionSuggest(accessToken, payload);
          if (!cancelled) {
            setJobId(nextJobId);
            setPolling(true);
          }
        } catch {
          // Vision is optional — Confirm and Save continue independently.
        }
      })();
    }, VISION_IDENTITY_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [accessToken, draftId, onCatalogMiss, photoFingerprint, setJobId, setSelectedSeasonLabel]);

  useEffect(() => {
    if (!accessToken || !jobId || !polling) {
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();
    const poll = async () => {
      if (Date.now() - startedAt >= VISION_TIMEOUT_MS) {
        if (!cancelled) {
          setPolling(false);
        }
        return;
      }

      try {
        const job = await fetchVisionJob(accessToken, jobId);
        if (cancelled || job.status === "pending") {
          return;
        }

        setPolling(false);
        if (appliedJobId.current !== job.jobId) {
          appliedJobId.current = job.jobId;
          await applySuggestions(job);
        }
      } catch {
        if (!cancelled) {
          setPolling(false);
        }
      }
    };

    const interval = setInterval(() => void poll(), VISION_POLL_INTERVAL_MS);
    void poll();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [accessToken, applySuggestions, jobId, polling]);

  const applySuggestion = useCallback(async () => {
    if (!suggestion?.suggestions || !accessToken) {
      return;
    }

    const suggestions = suggestion.suggestions;
    mutate((current) => {
      let next = current;
      if (suggestions.clubId && suggestions.clubLabel) {
        next = setDraftClub(next, next.activeDraftId, suggestions.clubId, suggestions.clubLabel);
      }
      if (suggestions.seasonId) {
        next = setDraftSeason(next, next.activeDraftId, suggestions.seasonId);
      }
      if (suggestions.seasonLabel) {
        setSelectedSeasonLabel(suggestions.seasonLabel);
      }
      if (suggestions.type) {
        next = selectDraftKitType(next, next.activeDraftId, suggestions.type);
      }
      return next;
    });

    if (suggestions.clubId) {
      await fetchClubSeasons(accessToken, suggestions.clubId);
    }
    setSuggestion(null);
    setApplied(true);
    onCatalogMiss?.(false);
  }, [accessToken, mutate, onCatalogMiss, setSelectedSeasonLabel, suggestion]);

  return {
    suggestion,
    suggestionOpacity,
    bannerState: resolveConfirmVisionBannerState({
      activated: Boolean(accessToken),
      outOfQuota: false,
      analyzing: polling,
      succeeded: applied,
    }),
    applySuggestion,
    dismissSuggestion: () => setSuggestion(null),
  };
}
