import type { VisionJobResponse } from "@kit/api-contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchVisionGroupingJob, startVisionGroupingSuggest } from "@/api/vision-grouping";
import {
  applyGroupingSuggestion,
  ensureSessionPhotoIds,
  groupingJobFingerprint,
  groupingPriorGroups,
  markGroupingSettled,
} from "@/capture/captureSession";
import type { CaptureSessionMutator, CaptureSessionState } from "@/capture/captureSessionTypes";
import {
  buildGroupingSuggestRequest,
  closeGroupingRun,
  shouldBeginGroupingStart,
} from "@/capture/groupingSuggestRequest";
import { readPreparedPhotoBase64 } from "@/capture/photoBytes";
import { stickySize } from "@/prefs/stickySizeStore";
import { motion } from "@/theme/tokens";

const GROUPING_TIMEOUT_MS = 15_000;
const GROUPING_POLL_INTERVAL_MS = 2_000;
/** Between two landed groups, so the overview fills row by row rather than all at once. */
export const GROUPING_ROW_STAGGER_MS = motion.fast;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type UseConfirmGroupingOptions = {
  accessToken: string | null;
  sessionId: string | undefined;
  state: CaptureSessionState | null;
  mutate: CaptureSessionMutator;
  reduceMotion: boolean;
};

/**
 * Runs Vision grouping for the bulk overview and applies every group by its own confidence
 * (`applyGroupingSuggestion`). Confident groups bind, middling ones become Tjek drafts, weak ones
 * stay without a jersey. One uncertain group never holds back the others.
 */
export function useConfirmGrouping({
  accessToken,
  sessionId,
  state,
  mutate,
  reduceMotion,
}: UseConfirmGroupingOptions) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
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

  const applyJob = useCallback(
    async (job: VisionJobResponse): Promise<boolean> => {
      if (job.status !== "ready") {
        return false;
      }

      const groups = job.grouping?.groups ?? [];
      for (const [index, group] of groups.entries()) {
        if (index > 0 && !reduceMotion) {
          await wait(GROUPING_ROW_STAGGER_MS);
        }
        mutate((current) =>
          applyGroupingSuggestion(current, { groups: [group] }, { defaultSize: stickySize.get() }),
        );
      }
      mutate((current) => markGroupingSettled(current));
      return true;
    },
    [mutate, reduceMotion],
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

        const applied = await applyJob(job);
        if (!cancelled) {
          applyGroupingClose(applied ? "complete" : "error", startedFingerprint.current);
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

  /** Sortér selv i stedet: stop waiting for Vision. The photos stay without a jersey. */
  const stop = useCallback(() => {
    appliedJobId.current = null;
    setJobId(null);
    applyGroupingClose("skip", startedFingerprint.current);
    mutate((current) => markGroupingSettled(current));
  }, [applyGroupingClose, mutate]);

  return { analyzing, stop };
}
