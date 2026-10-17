import type { VisionJobResponse } from "@kit/api-contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchVisionGroupingJob, startVisionGroupingSuggest } from "@/api/vision-grouping";
import { inBatches, pendingUploadFailures, splitPreparedPhotos } from "@/capture/captureOverview";
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
const GROUPING_START_TIMEOUT_MS = 30_000;
/** Photos read and shrunk at once; a pile of sixteen in parallel stalls a slow device. */
const GROUPING_PREPARE_BATCH = 4;
/** Between two landed groups, so the overview fills row by row rather than all at once. */
export const GROUPING_ROW_STAGGER_MS = motion.fast;

type PreparedGroupingPhoto = { photoId: string; contentBase64: string };

/** A start request that never answers must end as "Vision did not answer", not a spinner. */
function withinTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Vision grouping start timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Prepares each photo on its own, so one that fails never takes the others down with it. */
async function prepareGroupingPhotos(state: CaptureSessionState, uris: string[]) {
  const prepared: PromiseSettledResult<PreparedGroupingPhoto>[] = [];
  for (const batch of inBatches(uris, GROUPING_PREPARE_BATCH)) {
    prepared.push(
      ...(await Promise.allSettled(
        batch.map(
          async (uri): Promise<PreparedGroupingPhoto> => ({
            photoId: state.photoIdByUri?.[uri] ?? "",
            contentBase64: await readPreparedPhotoBase64(uri, "other", "groupingThumb"),
          }),
        ),
      )),
    );
  }
  return splitPreparedPhotos(uris, prepared);
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
  /** Vision did not answer (timeout or error). A run the collector stopped is not a failure. */
  const [failed, setFailed] = useState(false);
  /** Prøv Vision igen bumps this, which makes every earlier failure stale. */
  const [attempt, setAttempt] = useState(0);
  const attemptRef = useRef(0);
  attemptRef.current = attempt;
  /** Photos whose prepare was rejected: left out of the request, still in the pile (Prøv igen). */
  const [uploadFailed, setUploadFailed] = useState<string[]>([]);
  const uploadFailedRef = useRef<string[]>([]);
  uploadFailedRef.current = uploadFailed;
  const retryingUploadRef = useRef(false);
  /** The follow-up run for retried photos; polled apart so the rest of the session is not held. */
  const [followUpJobId, setFollowUpJobId] = useState<string | null>(null);
  const startedFingerprint = useRef<string | null>(null);
  const failedFingerprints = useRef(new Set<string>());
  const appliedJobId = useRef<string | null>(null);
  const snapshotRef = useRef<CaptureSessionState | null>(state);
  snapshotRef.current = state;

  // No token (Vision off, or signed out) means no grouping job, so nothing waits on one.
  const jobKey = accessToken && state ? groupingJobFingerprint(state) : null;

  useEffect(() => {
    void sessionId;
    startedFingerprint.current = null;
    failedFingerprints.current.clear();
    appliedJobId.current = null;
    setJobId(null);
    setAnalyzing(false);
    setFailed(false);
    setUploadFailed([]);
    setFollowUpJobId(null);
    retryingUploadRef.current = false;
  }, [sessionId]);

  const applyGroupingClose = useCallback(
    (reason: "timeout" | "error" | "skip" | "complete", fingerprint: string | null) => {
      const close = closeGroupingRun(reason);
      if (close.failed && fingerprint) {
        failedFingerprints.current.add(`${fingerprint}#${attemptRef.current}`);
      }
      setFailed(close.failed && reason !== "skip");
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
        failed: Boolean(jobKey && failedFingerprints.current.has(`${jobKey}#${attempt}`)),
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
    setFailed(false);
    setAnalyzing(true);

    const ensured = ensureSessionPhotoIds(snapshot);
    if (ensured !== snapshot) {
      snapshotRef.current = ensured;
      mutate(() => ensured);
    }

    void (async () => {
      try {
        const { photos, failedUris } = await prepareGroupingPhotos(ensured, ensured.unboundUris);
        if (mountedRef.current) {
          setUploadFailed(failedUris);
        }
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

        const nextJobId = await withinTimeout(
          startVisionGroupingSuggest(accessToken, request),
          GROUPING_START_TIMEOUT_MS,
        );
        if (mountedRef.current) {
          setJobId(nextJobId);
        }
      } catch {
        if (mountedRef.current) {
          applyGroupingClose("error", jobKey);
        }
      }
    })();
  }, [accessToken, analyzing, applyGroupingClose, attempt, jobKey, mutate, sessionId]);

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

  /** Prøv Vision igen: forget the failed run and ask again. */
  const retry = useCallback(() => {
    appliedJobId.current = null;
    setFailed(false);
    setAttempt((current) => current + 1);
  }, []);

  /** Prøv igen: prepare only the failed photos and send them as a follow-up run. */
  const retryUpload = useCallback(async () => {
    const snapshot = snapshotRef.current;
    if (!accessToken || !sessionId || !snapshot || retryingUploadRef.current) {
      return;
    }
    const uris = pendingUploadFailures(uploadFailedRef.current, snapshot);
    if (uris.length === 0) {
      setUploadFailed([]);
      return;
    }

    retryingUploadRef.current = true;
    try {
      const { photos, failedUris } = await prepareGroupingPhotos(snapshot, uris);
      const request = buildGroupingSuggestRequest({
        sessionId,
        photos,
        priorGroups: groupingPriorGroups(snapshotRef.current ?? snapshot),
      });
      // Nothing to send (a lone photo with no jersey to join) still counts as prepared.
      const nextJobId = request ? await startVisionGroupingSuggest(accessToken, request) : null;
      if (!mountedRef.current) {
        return;
      }
      setUploadFailed(failedUris);
      if (nextJobId) {
        setFollowUpJobId(nextJobId);
      }
    } catch {
      // The send itself failed: those photos still did not reach Vision, so the row stays.
      if (mountedRef.current) {
        setUploadFailed(uris);
      }
    } finally {
      retryingUploadRef.current = false;
    }
  }, [accessToken, sessionId]);

  useEffect(() => {
    if (!accessToken || !followUpJobId) {
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();

    const poll = async () => {
      if (Date.now() - startedAt >= GROUPING_TIMEOUT_MS) {
        // Vision did not answer; the photos were uploaded and wait in the pile.
        if (!cancelled) {
          setFollowUpJobId(null);
        }
        return;
      }

      try {
        const job = await fetchVisionGroupingJob(accessToken, followUpJobId);
        if (cancelled || job.status === "pending") {
          return;
        }
        if (job.status === "ready") {
          await applyJob(job);
        }
        if (!cancelled) {
          setFollowUpJobId(null);
        }
      } catch {
        if (!cancelled) {
          setFollowUpJobId(null);
        }
      }
    };

    const interval = setInterval(() => void poll(), GROUPING_POLL_INTERVAL_MS);
    void poll();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [accessToken, applyJob, followUpJobId]);

  return { analyzing, failed, stop, retry, uploadFailed, retryUpload };
}
