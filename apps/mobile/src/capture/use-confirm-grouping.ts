import type { VisionJobResponse } from "@kit/api-contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated } from "react-native";
import { fetchVisionGroupingJob, startVisionGroupingSuggest } from "@/api/vision-grouping";
import {
  acceptPendingGrouping,
  applyGroupingSuggestion,
  dismissPendingGrouping,
  groupingPriorGroups,
  sessionPhotoIds,
  shouldStartGroupingJob,
  unboundGroupingFingerprint,
} from "@/capture/captureSession";
import type { CaptureSessionMutator, CaptureSessionState } from "@/capture/captureSessionTypes";
import { readPreparedPhotoBase64 } from "@/capture/photoBytes";
import { motion } from "@/theme/tokens";

const GROUPING_TIMEOUT_MS = 15_000;
const GROUPING_POLL_INTERVAL_MS = 2_000;

type UseConfirmGroupingOptions = {
  accessToken: string | null;
  sessionId: string | undefined;
  state: CaptureSessionState | null;
  mutate: CaptureSessionMutator;
  reduceMotion: boolean;
};

export function useConfirmGrouping({
  accessToken,
  sessionId,
  state,
  mutate,
  reduceMotion,
}: UseConfirmGroupingOptions) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [suggestion, setSuggestion] = useState<VisionJobResponse | null>(null);
  const suggestionOpacity = useRef(new Animated.Value(0)).current;
  const startedFingerprint = useRef<string | null>(null);

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

  const applyJob = useCallback(
    (job: VisionJobResponse) => {
      if (job.status !== "ready" || !job.grouping) {
        return;
      }

      const preselect = job.preselect === true;
      if (!preselect) {
        mutate((current) => {
          const next = applyGroupingSuggestion(current, job.grouping!, { preselect: false });
          if (next.groupingDesignGap) {
            return next;
          }
          setSuggestion(job);
          fadeInSuggestion();
          return next;
        });
        return;
      }

      mutate((current) => applyGroupingSuggestion(current, job.grouping!, { preselect: true }));
      setSuggestion(null);
    },
    [fadeInSuggestion, mutate],
  );

  useEffect(() => {
    if (!accessToken || !sessionId || !state) {
      return;
    }

    if (!shouldStartGroupingJob(state)) {
      return;
    }

    const fingerprint = `${unboundGroupingFingerprint(state)}|${groupingPriorGroups(state)
      .map((group) => group.photoIds.join("-"))
      .join(";")}`;
    if (startedFingerprint.current === fingerprint) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const photos = await Promise.all(
          state.unboundUris.map(async (uri) => ({
            photoId: state.photoIdByUri?.[uri] ?? "",
            contentBase64: await readPreparedPhotoBase64(uri, "other", "groupingThumb"),
          })),
        );

        const filtered = photos.filter((photo) => photo.photoId.length > 0);
        const priorGroups = groupingPriorGroups(state);
        if (filtered.length < 2 && priorGroups.length === 0) {
          return;
        }
        if (filtered.length === 0) {
          return;
        }

        const nextJobId = await startVisionGroupingSuggest(accessToken, {
          sessionId,
          photos: filtered,
          priorGroups: priorGroups.length > 0 ? priorGroups : undefined,
        });
        if (cancelled) {
          return;
        }
        startedFingerprint.current = fingerprint;
        setJobId(nextJobId);
        setPolling(true);
      } catch {
        // Grouping is optional — Confirm and Save continue independently.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, sessionId, state]);

  useEffect(() => {
    if (!accessToken || !jobId || !polling) {
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();

    const poll = async () => {
      if (Date.now() - startedAt >= GROUPING_TIMEOUT_MS) {
        if (!cancelled) {
          setPolling(false);
        }
        return;
      }

      try {
        const job = await fetchVisionGroupingJob(accessToken, jobId);
        if (cancelled || job.status === "pending") {
          return;
        }

        setPolling(false);
        applyJob(job);
      } catch {
        if (!cancelled) {
          setPolling(false);
        }
      }
    };

    const interval = setInterval(() => void poll(), GROUPING_POLL_INTERVAL_MS);
    void poll();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [accessToken, applyJob, jobId, polling]);

  const applySuggestion = useCallback(() => {
    mutate((current) => acceptPendingGrouping(current));
    setSuggestion(null);
  }, [mutate]);

  const dismissSuggestion = useCallback(() => {
    mutate((current) => dismissPendingGrouping(current));
    setSuggestion(null);
  }, [mutate]);

  const groupingMessage =
    state?.groupingDesignGap || (suggestion?.grouping && suggestion.grouping.groups.length > 1)
      ? null
      : suggestion?.grouping
        ? "Trøje foreslået"
        : null;

  return {
    analyzing: polling,
    suggestion,
    suggestionOpacity,
    groupingMessage,
    groupingDesignGap: state?.groupingDesignGap === true,
    applySuggestion,
    dismissSuggestion,
    sessionPhotoIds: state ? sessionPhotoIds(state) : [],
  };
}
