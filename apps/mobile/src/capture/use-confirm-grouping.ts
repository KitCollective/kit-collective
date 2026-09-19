import type { VisionJobResponse } from "@kit/api-contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated } from "react-native";
import { fetchVisionGroupingJob, startVisionGroupingSuggest } from "@/api/vision-grouping";
import {
  acceptPendingGrouping,
  applyFillOrderToDraft,
  applyGroupingSuggestion,
  dismissPendingGrouping,
  ensureSessionPhotoIds,
  groupingJobFingerprint,
  groupingPriorGroups,
  sessionPhotoIds,
  setActiveDraft,
  uriForPhotoId,
} from "@/capture/captureSession";
import type { CaptureSessionMutator, CaptureSessionState } from "@/capture/captureSessionTypes";
import {
  buildGroupingSuggestRequest,
  closeGroupingRun,
  shouldBeginGroupingStart,
} from "@/capture/groupingSuggestRequest";
import { readPreparedPhotoBase64 } from "@/capture/photoBytes";
import { motion } from "@/theme/tokens";

const GROUPING_TIMEOUT_MS = 15_000;
const GROUPING_POLL_INTERVAL_MS = 2_000;
export const GROUPING_TAB_STAGGER_MS = motion.slow;
export const GROUPING_GATHER_MS = motion.slow + motion.base;
export const GROUPING_FIRST_ROLL_MS = motion.slow;
export const GROUPING_SLOT_ROLL_MS = motion.slow;
export const GROUPING_SLOT_POP_MS = motion.slow;
export const GROUPING_SLOT_HOLD_MS = motion.slow + motion.base;
export const GROUPING_REVEAL_SETTLE_MS = motion.base;
/** Travel from the last filled tab back to jersey 1 — rare, so motion.slow. */
export const GROUPING_RETURN_MS = motion.slow;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function urisFromPhotoIds(state: CaptureSessionState | null, photoIds: string[]): string[] {
  if (!state) {
    return [];
  }
  return photoIds
    .map((photoId) => uriForPhotoId(state, photoId))
    .filter((uri): uri is string => Boolean(uri));
}

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
  const [analyzing, setAnalyzing] = useState(false);
  const [gatheringUris, setGatheringUris] = useState<string[]>([]);
  const [rollingUris, setRollingUris] = useState<string[]>([]);
  const [hiddenSandboxUris, setHiddenSandboxUris] = useState<string[]>([]);
  const [homecoming, setHomecoming] = useState(false);
  const [suggestion, setSuggestion] = useState<VisionJobResponse | null>(null);
  const suggestionOpacity = useRef(new Animated.Value(0)).current;
  const startedFingerprint = useRef<string | null>(null);
  const failedFingerprints = useRef(new Set<string>());
  const appliedJobId = useRef<string | null>(null);
  const snapshotRef = useRef<CaptureSessionState | null>(state);
  snapshotRef.current = state;

  const jobKey = state ? groupingJobFingerprint(state) : null;

  useEffect(() => {
    void sessionId;
    startedFingerprint.current = null;
    failedFingerprints.current.clear();
    appliedJobId.current = null;
    setJobId(null);
    setAnalyzing(false);
    setGatheringUris([]);
    setRollingUris([]);
    setHiddenSandboxUris([]);
    setHomecoming(false);
  }, [sessionId]);

  const applyGroupingClose = useCallback(
    (reason: "timeout" | "error" | "skip" | "complete", fingerprint: string | null) => {
      const close = closeGroupingRun(reason);
      if (close.failed && fingerprint) {
        failedFingerprints.current.add(fingerprint);
      }
      setAnalyzing(close.analyzing);
    },
    [],
  );

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
    async (job: VisionJobResponse) => {
      if (job.status !== "ready" || !job.grouping) {
        return;
      }

      const groups = job.grouping.groups;
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

      const revealSlice = (slice: Array<{ photoIds: string[] }>, activateIndex: number) => {
        mutate((current) => {
          let next = applyGroupingSuggestion(current, { groups: slice }, { preselect: true });
          const target = next.drafts[activateIndex];
          if (!target) {
            return next;
          }
          next = applyFillOrderToDraft(next, target.id);
          return setActiveDraft(next, target.id);
        });
      };

      if (reduceMotion) {
        revealSlice(groups, 0);
        setGatheringUris([]);
        setRollingUris([]);
        setHiddenSandboxUris([]);
        setHomecoming(false);
        setSuggestion(null);
        return;
      }

      for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
        const prior = groups.slice(0, groupIndex);
        const photoIds = groups[groupIndex]?.photoIds ?? [];
        if (groupIndex > 0) {
          setRollingUris([]);
          revealSlice([...prior, { photoIds: [] }], groupIndex);
          await wait(GROUPING_TAB_STAGGER_MS);
        }

        const gatherUris = urisFromPhotoIds(snapshotRef.current, photoIds);
        if (gatherUris.length > 0) {
          setGatheringUris(gatherUris);
          await wait(GROUPING_FIRST_ROLL_MS);
          setRollingUris(gatherUris.slice(0, 1));
          await wait(GROUPING_GATHER_MS - GROUPING_FIRST_ROLL_MS);
          setHiddenSandboxUris((current) => [
            ...current,
            ...gatherUris.filter((uri) => !current.includes(uri)),
          ]);
        }

        setGatheringUris([]);

        for (let shown = 1; shown < gatherUris.length; shown += 1) {
          await wait(GROUPING_SLOT_ROLL_MS);
          setRollingUris(gatherUris.slice(0, shown + 1));
        }

        await wait(GROUPING_SLOT_POP_MS);
        await wait(GROUPING_SLOT_HOLD_MS);
        if (photoIds.length > 0) {
          revealSlice([...prior, { photoIds }], groupIndex);
        }
      }

      const activateGroup = (index: number) => {
        const photoIds = groups[index]?.photoIds ?? [];
        setRollingUris(urisFromPhotoIds(snapshotRef.current, photoIds));
        mutate((current) => {
          const target = current.drafts[index];
          return target ? setActiveDraft(current, target.id) : current;
        });
      };

      if (groups.length > 1) {
        setHomecoming(true);
        const waypoints =
          groups.length <= 3
            ? Array.from({ length: groups.length - 1 }, (_, step) => groups.length - 2 - step)
            : [0];
        for (const index of waypoints) {
          activateGroup(index);
          await wait(GROUPING_RETURN_MS);
        }
        setHomecoming(false);
      } else {
        activateGroup(0);
      }
      await wait(GROUPING_REVEAL_SETTLE_MS);
      setSuggestion(null);
    },
    [fadeInSuggestion, mutate, reduceMotion],
  );

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!accessToken || !sessionId) {
      return;
    }
    if (
      !shouldBeginGroupingStart({
        jobKey,
        analyzing,
        failed: Boolean(jobKey && failedFingerprints.current.has(jobKey)),
      })
    ) {
      return;
    }
    if (!jobKey) {
      return;
    }

    const snapshot = snapshotRef.current;
    if (!snapshot) {
      return;
    }

    startedFingerprint.current = jobKey;
    setAnalyzing(true);

    const ensured = ensureSessionPhotoIds(snapshot);
    if (ensured !== snapshot) {
      snapshotRef.current = ensured;
      mutate(() => ensured);
    }

    void (async () => {
      try {
        const prepared = await Promise.allSettled(
          ensured.unboundUris.map(async (uri) => ({
            photoId: ensured.photoIdByUri?.[uri] ?? "",
            contentBase64: await readPreparedPhotoBase64(uri, "other", "groupingThumb"),
          })),
        );
        const photos = prepared
          .filter(
            (
              result,
            ): result is PromiseFulfilledResult<{ photoId: string; contentBase64: string }> =>
              result.status === "fulfilled",
          )
          .map((result) => result.value);
        const request = buildGroupingSuggestRequest({
          sessionId,
          photos,
          priorGroups: groupingPriorGroups(ensured),
        });
        if (!request) {
          if (mountedRef.current) {
            applyGroupingClose("skip", jobKey);
          }
          return;
        }

        const nextJobId = await startVisionGroupingSuggest(accessToken, request);
        if (mountedRef.current) {
          setJobId(nextJobId);
        }
      } catch {
        if (mountedRef.current) {
          applyGroupingClose("error", jobKey);
        }
      }
    })();
  }, [accessToken, analyzing, applyGroupingClose, jobKey, mutate, sessionId]);

  useEffect(() => {
    if (!accessToken || !jobId || !analyzing) {
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();

    const poll = async () => {
      if (Date.now() - startedAt >= GROUPING_TIMEOUT_MS) {
        if (!cancelled) {
          applyGroupingClose("timeout", startedFingerprint.current);
          setJobId(null);
        }
        return;
      }

      try {
        const job = await fetchVisionGroupingJob(accessToken, jobId);
        if (cancelled || job.status === "pending") {
          return;
        }
        if (appliedJobId.current === job.jobId) {
          return;
        }
        appliedJobId.current = job.jobId;

        await applyJob(job);
        if (!cancelled) {
          applyGroupingClose("complete", startedFingerprint.current);
          setJobId(null);
        }
      } catch {
        if (!cancelled) {
          applyGroupingClose("error", startedFingerprint.current);
          setJobId(null);
        }
      }
    };

    const interval = setInterval(() => void poll(), GROUPING_POLL_INTERVAL_MS);
    void poll();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [accessToken, applyGroupingClose, applyJob, analyzing, jobId]);

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

  const groupingFailed = jobKey ? failedFingerprints.current.has(jobKey) : false;

  return {
    analyzing,
    gatheringUris,
    rollingUris,
    hiddenSandboxUris,
    homecoming,
    blocksIdentity: analyzing || (Boolean(jobKey) && !groupingFailed),
    suggestion,
    suggestionOpacity,
    groupingMessage,
    groupingDesignGap: state?.groupingDesignGap === true,
    applySuggestion,
    dismissSuggestion,
    sessionPhotoIds: state ? sessionPhotoIds(state) : [],
  };
}
