import type { VisionJobResponse } from "@kit/api-contract";
import type { PhotoRole } from "@kit/domain";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated } from "react-native";
import { fetchClubSeasons } from "@/api/catalog";
import { fetchVisionJob, startVisionSuggest } from "@/api/vision";
import { selectDraftKitType, setDraftClub, setDraftSeason } from "@/capture/captureSession";
import type { CaptureJerseyDraft, CaptureSessionMutator } from "@/capture/captureSessionTypes";
import {
  confirmClubWasEdited,
  confirmKitTypeWasEdited,
  confirmSeasonWasEdited,
  resetConfirmManualEdits,
} from "@/capture/confirmManualEdits";
import { resolveConfirmVisionBannerState } from "@/capture/confirmVisionBanner";
import { readPhotoBase64 } from "@/capture/photoBytes";
import { motion } from "@/theme/tokens";

const VISION_TIMEOUT_MS = 12_000;
const VISION_POLL_INTERVAL_MS = 2_000;

type UseConfirmVisionOptions = {
  accessToken: string | null;
  sessionId: string | undefined;
  draft: CaptureJerseyDraft | null;
  mutate: CaptureSessionMutator;
  reduceMotion: boolean;
  jobId: string | null;
  setJobId: (jobId: string | null) => void;
  setSelectedSeasonLabel: (label: string | null) => void;
};

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
}: UseConfirmVisionOptions) {
  const [polling, setPolling] = useState(false);
  const [suggestion, setSuggestion] = useState<VisionJobResponse | null>(null);
  const [applied, setApplied] = useState(false);
  const suggestionOpacity = useRef(new Animated.Value(0)).current;
  const appliedJobId = useRef<string | null>(null);
  const startAttempted = useRef(false);

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
    async (job: VisionJobResponse, preselect: boolean) => {
      if (job.status !== "ready" || !job.suggestions || !sessionId) {
        return;
      }

      const suggestions = job.suggestions;
      if (!preselect) {
        setSuggestion(job);
        fadeInSuggestion();
        return;
      }

      mutate((current) => {
        let next = current;
        if (!confirmClubWasEdited() && suggestions.clubId && suggestions.clubLabel) {
          next = setDraftClub(next, next.activeDraftId, suggestions.clubId, suggestions.clubLabel);
        }
        if (!confirmSeasonWasEdited() && suggestions.seasonId) {
          next = setDraftSeason(next, next.activeDraftId, suggestions.seasonId);
        }
        if (!confirmSeasonWasEdited() && suggestions.seasonLabel) {
          setSelectedSeasonLabel(suggestions.seasonLabel);
        }
        if (!confirmKitTypeWasEdited() && suggestions.type) {
          next = selectDraftKitType(next, next.activeDraftId, suggestions.type);
        }
        return next;
      });

      if (!confirmSeasonWasEdited() && suggestions.clubId && accessToken) {
        await fetchClubSeasons(accessToken, suggestions.clubId);
      }
      setApplied(true);
      fadeInSuggestion();
    },
    [accessToken, fadeInSuggestion, mutate, sessionId, setSelectedSeasonLabel],
  );

  const startVision = useCallback(
    async (role: PhotoRole, uri: string) => {
      if (!accessToken || jobId || startAttempted.current) {
        return;
      }

      startAttempted.current = true;
      try {
        const contentBase64 = await readPhotoBase64(uri);
        const nextJobId = await startVisionSuggest(accessToken, {
          photo: { role, contentBase64 },
        });
        setJobId(nextJobId);
        setPolling(true);
      } catch {
        // Vision is optional — Confirm and Save continue independently.
      }
    },
    [accessToken, jobId, setJobId],
  );

  const draftId = draft?.id ?? null;
  const firstPhotoUri = draft?.photos[0]?.uri ?? null;
  const firstPhotoRole = draft?.photos[0]?.role ?? "front";

  useEffect(() => {
    setJobId(null);
    setPolling(false);
    setSuggestion(null);
    setApplied(false);
    startAttempted.current = false;
    appliedJobId.current = null;
    resetConfirmManualEdits();
    setSelectedSeasonLabel(null);

    if (!accessToken || !draftId || !firstPhotoUri) {
      return;
    }

    let cancelled = false;
    void (async () => {
      startAttempted.current = true;
      try {
        const contentBase64 = await readPhotoBase64(firstPhotoUri);
        const nextJobId = await startVisionSuggest(accessToken, {
          photo: { role: firstPhotoRole, contentBase64 },
        });
        if (!cancelled) {
          setJobId(nextJobId);
          setPolling(true);
        }
      } catch {
        // Vision is optional — Confirm and Save continue independently.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, draftId, firstPhotoRole, firstPhotoUri, setJobId, setSelectedSeasonLabel]);

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
        if (job.status === "ready" && job.suggestions && appliedJobId.current !== job.jobId) {
          appliedJobId.current = job.jobId;
          await applySuggestions(job, job.preselect === true);
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
  }, [accessToken, mutate, setSelectedSeasonLabel, suggestion]);

  return {
    suggestion,
    suggestionOpacity,
    bannerState: resolveConfirmVisionBannerState({
      activated: Boolean(accessToken),
      outOfQuota: false,
      analyzing: polling,
      succeeded: applied,
    }),
    startVision,
    applySuggestion,
    dismissSuggestion: () => setSuggestion(null),
  };
}
