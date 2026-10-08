import type { VisionFieldPreselect, VisionJobResponse, VisionSuggestions } from "@kit/api-contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated } from "react-native";
import { fetchClubSeasons } from "@/api/catalog";
import { fetchVisionJob, startVisionSuggest, VisionPremiumRequiredError } from "@/api/vision";
import {
  applyIdentitySuggestion,
  catalogSideId,
  selectDraftKitType,
  setDraftBadge,
  setDraftCatalogSide,
  setDraftPlayer,
  setDraftSeason,
  suggestedCatalogSideId,
} from "@/capture/captureSession";
import type { CaptureJerseyDraft, CaptureSessionMutator } from "@/capture/captureSessionTypes";
import { resolveVisionCatalogMissHint } from "@/capture/catalogMissHint";
import {
  confirmBadgeWasEdited,
  confirmClubWasEdited,
  confirmKitTypeWasEdited,
  confirmPlayerWasEdited,
  confirmSeasonWasEdited,
  resetConfirmManualEdits,
} from "@/capture/confirmManualEdits";
import { resolveConfirmVisionBannerState } from "@/capture/confirmVisionBanner";
import {
  identityQueueFingerprint,
  identityRunKey,
  identitySettledSnapshot,
  nextQueuedIdentityDraft,
  raceWithTimeout,
  remainingIdentityBudget,
  shouldAttemptIdentityQueue,
  shouldSyncIdentityChrome,
} from "@/capture/identityDraftQueue";
import { buildSuggestOnlyVisionJob } from "@/capture/identitySuggestOnly";
import { buildIdentitySuggestRequest } from "@/capture/identitySuggestRequest";
import { motion } from "@/theme/tokens";

type IdentityFieldSnapshot = {
  fieldPreselect: VisionFieldPreselect;
  suggestions: VisionSuggestions | null;
  catalogMiss: boolean;
};

/** Must outlast Gemini's 15s abort plus poll jitter — a timeout is not a catalog miss. */
const VISION_TIMEOUT_MS = 45_000;
const VISION_POLL_INTERVAL_MS = 2_000;
const VISION_IDENTITY_DEBOUNCE_MS = 500;

type UseConfirmVisionOptions = {
  accessToken: string | null;
  sessionId: string | undefined;
  draft: CaptureJerseyDraft | null;
  sessionDrafts?: CaptureJerseyDraft[];
  mutate: CaptureSessionMutator;
  reduceMotion: boolean;
  jobId: string | null;
  setJobId: (jobId: string | null) => void;
  setSelectedSeasonLabel: (label: string | null) => void;
  onCatalogMiss?: (miss: boolean) => void;
  onPremiumRequired?: () => Promise<boolean>;
  /** Hold identity until grouping has bound drafts (or failed). */
  deferIdentity?: boolean;
  /** Per-draft photo-set readiness: wait for front+back while grouping is in flight. */
  groupingInFlight?: boolean;
};

function hasPreselectFields(fieldPreselect: VisionFieldPreselect | undefined): boolean {
  return Boolean(
    fieldPreselect?.club ||
      fieldPreselect?.season ||
      fieldPreselect?.type ||
      fieldPreselect?.player ||
      fieldPreselect?.badge,
  );
}

function hasSuggestFields(job: VisionJobResponse): boolean {
  return Boolean(
    job.suggestions?.clubId ||
      job.suggestions?.seasonId ||
      job.suggestions?.type ||
      job.suggestions?.playerId ||
      job.suggestions?.patchId ||
      job.catalogMiss ||
      job.clubHint ||
      job.nationalTeamHint,
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
  sessionDrafts = [],
  mutate,
  reduceMotion,
  jobId,
  setJobId,
  setSelectedSeasonLabel,
  onCatalogMiss,
  onPremiumRequired,
  deferIdentity = false,
  groupingInFlight = false,
}: UseConfirmVisionOptions) {
  const [polling, setPolling] = useState(false);
  const [suggestion, setSuggestion] = useState<VisionJobResponse | null>(null);
  const [applied, setApplied] = useState(false);
  const [catalogMissHint, setCatalogMissHint] = useState<string | null>(null);
  const suggestionOpacity = useRef(new Animated.Value(0)).current;
  const appliedJobId = useRef<string | null>(null);
  const snapshotsByDraftRef = useRef(new Map<string, IdentityFieldSnapshot>());
  const startedIdentityKeysRef = useRef(new Set<string>());
  const sessionDraftsRef = useRef(sessionDrafts);
  sessionDraftsRef.current = sessionDrafts;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const wasDeferredRef = useRef(deferIdentity);
  const groupingInFlightRef = useRef(groupingInFlight);
  groupingInFlightRef.current = groupingInFlight;
  const prevQueueFingerprintRef = useRef<string | null>(null);
  const identityLoopActiveRef = useRef(false);
  const identityKickAgainRef = useRef(false);
  const identityUnmountedRef = useRef(false);
  const [inFlightDraftId, setInFlightDraftId] = useState<string | null>(null);

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
    async (job: VisionJobResponse, targetDraftId?: string) => {
      if (job.status !== "ready" || !sessionId) {
        return;
      }

      const currentDraftId = targetDraftId ?? draftRef.current?.id;
      if (!currentDraftId) {
        return;
      }

      if (job.jobId) {
        appliedJobId.current = job.jobId;
      }

      const isActiveDraft = currentDraftId === draftRef.current?.id;
      onCatalogMiss?.(job.catalogMiss === true && isActiveDraft);

      const snapshot: IdentityFieldSnapshot = {
        fieldPreselect: job.fieldPreselect ?? {},
        suggestions: job.suggestions ?? null,
        catalogMiss: job.catalogMiss === true,
      };
      snapshotsByDraftRef.current.set(currentDraftId, snapshot);

      if (job.catalogMiss && isActiveDraft) {
        setCatalogMissHint(resolveVisionCatalogMissHint(job));
      }

      if (job.catalogMiss && !job.suggestions) {
        return;
      }

      const fieldPreselect = job.fieldPreselect ?? {};
      const suggestions = job.suggestions;
      const shouldPreselect = hasPreselectFields(fieldPreselect);

      if (!shouldPreselect && suggestions) {
        if (currentDraftId === draftRef.current?.id) {
          setSuggestion(job);
          fadeInSuggestion();
        }
        return;
      }

      if (!shouldPreselect && !hasSuggestFields(job)) {
        return;
      }

      if (suggestions) {
        mutate((current) =>
          applyIdentitySuggestion(current, currentDraftId, suggestions, {
            fieldPreselect,
            manualEdits: {
              club: confirmClubWasEdited(),
              season: confirmSeasonWasEdited(),
              type: confirmKitTypeWasEdited(),
              player: confirmPlayerWasEdited(),
              badge: confirmBadgeWasEdited(),
            },
          }),
        );

        if (!confirmSeasonWasEdited() && suggestions.seasonLabel && fieldPreselect.season) {
          setSelectedSeasonLabel(suggestions.seasonLabel);
        }

        const suggestedSideId = suggestedCatalogSideId(suggestions, fieldPreselect);
        if (!confirmSeasonWasEdited() && accessToken && suggestedSideId) {
          try {
            await fetchClubSeasons(accessToken, suggestedSideId);
          } catch {
            // Season list is a Data drill convenience — a miss must not unwind applied fields.
          }
        }

        const suggestOnlyJob = buildSuggestOnlyVisionJob(job, {
          club: confirmClubWasEdited(),
          season: confirmSeasonWasEdited(),
          type: confirmKitTypeWasEdited(),
          player: confirmPlayerWasEdited(),
          badge: confirmBadgeWasEdited(),
        });
        if (suggestOnlyJob) {
          if (currentDraftId === draftRef.current?.id) {
            setSuggestion(suggestOnlyJob);
            fadeInSuggestion();
          }
          return;
        }

        if (currentDraftId === draftRef.current?.id) {
          setApplied(true);
          fadeInSuggestion();
        }
      }
    },
    [accessToken, fadeInSuggestion, mutate, onCatalogMiss, sessionId, setSelectedSeasonLabel],
  );
  const applySuggestionsRef = useRef(applySuggestions);
  applySuggestionsRef.current = applySuggestions;

  const draftId = draft?.id ?? null;
  const queueFingerprint = identityQueueFingerprint(sessionDrafts, groupingInFlight);

  useEffect(() => {
    setPolling(inFlightDraftId !== null && inFlightDraftId === draftId);
  }, [draftId, inFlightDraftId]);

  useEffect(() => {
    identityUnmountedRef.current = false;
    return () => {
      identityUnmountedRef.current = true;
    };
  }, []);

  useEffect(() => {
    const groupingJustClosed = wasDeferredRef.current && !deferIdentity;
    wasDeferredRef.current = deferIdentity;
    const previousFingerprint = prevQueueFingerprintRef.current;
    prevQueueFingerprintRef.current = queueFingerprint;

    if (
      !accessToken ||
      !shouldAttemptIdentityQueue({
        deferIdentity,
        hasAccessToken: true,
        queueFingerprint,
        previousFingerprint,
        groupingJustClosed,
      })
    ) {
      return;
    }

    if (identityLoopActiveRef.current) {
      identityKickAgainRef.current = true;
      return;
    }

    const startJob = async (payload: Awaited<ReturnType<typeof buildIdentitySuggestRequest>>) => {
      return startVisionSuggest(accessToken, payload).catch(async (error) => {
        if (!(error instanceof VisionPremiumRequiredError)) {
          throw error;
        }
        const granted = (await onPremiumRequired?.()) === true;
        if (!granted) {
          return null;
        }
        return startVisionSuggest(accessToken, payload);
      });
    };

    const runQueuedDraft = async () => {
      const next = nextQueuedIdentityDraft(
        sessionDraftsRef.current,
        startedIdentityKeysRef.current,
        groupingInFlightRef.current,
      );
      if (!next) {
        return false;
      }
      const key = identityRunKey(next);
      startedIdentityKeysRef.current.add(key);
      snapshotsByDraftRef.current.delete(next.id);
      setInFlightDraftId(next.id);
      const syncChrome = () => shouldSyncIdentityChrome(next.id, draftRef.current?.id ?? null);
      if (syncChrome()) {
        setJobId(null);
        setSuggestion(null);
        setApplied(false);
        appliedJobId.current = null;
        setCatalogMissHint(null);
        resetConfirmManualEdits();
        setSelectedSeasonLabel(null);
        onCatalogMiss?.(false);
        setPolling(true);
      }
      const settleIdle = () => {
        const snapshot = identitySettledSnapshot();
        snapshotsByDraftRef.current.set(next.id, snapshot);
      };
      const startedAt = Date.now();
      const remaining = () => remainingIdentityBudget(startedAt, VISION_TIMEOUT_MS);
      try {
        const live = sessionDraftsRef.current.find((entry) => entry.id === next.id) ?? next;
        const payload = await raceWithTimeout(buildIdentitySuggestRequest(live), remaining());
        const nextJobId = await raceWithTimeout(startJob(payload), remaining());
        if (!nextJobId) {
          settleIdle();
          return true;
        }
        if (syncChrome()) {
          setJobId(nextJobId);
          setPolling(true);
        }
        let settled = false;
        while (remaining() > 0) {
          const job = await raceWithTimeout(fetchVisionJob(accessToken, nextJobId), remaining());
          if (job.status === "pending") {
            await raceWithTimeout(
              new Promise<void>((resolve) => {
                setTimeout(resolve, VISION_POLL_INTERVAL_MS);
              }),
              remaining(),
            ).catch(() => undefined);
            continue;
          }
          if (job.status === "ready") {
            await applySuggestionsRef.current(job, next.id);
            settled = true;
          }
          break;
        }
        if (!settled) {
          settleIdle();
        }
      } catch {
        settleIdle();
      } finally {
        setInFlightDraftId((current) => (current === next.id ? null : current));
        if (syncChrome()) {
          setPolling(false);
        }
      }
      return true;
    };

    const launchIdentityLoop = (debounce: boolean) => {
      if (identityUnmountedRef.current) {
        return;
      }
      if (identityLoopActiveRef.current) {
        identityKickAgainRef.current = true;
        return;
      }
      identityLoopActiveRef.current = true;
      void (async () => {
        if (debounce) {
          await new Promise((resolve) => setTimeout(resolve, VISION_IDENTITY_DEBOUNCE_MS));
        }
        try {
          while (!identityUnmountedRef.current) {
            const ran = await runQueuedDraft();
            if (ran) {
              continue;
            }
            if (identityKickAgainRef.current) {
              identityKickAgainRef.current = false;
              continue;
            }
            break;
          }
        } finally {
          identityLoopActiveRef.current = false;
          if (
            !identityUnmountedRef.current &&
            (identityKickAgainRef.current ||
              Boolean(
                nextQueuedIdentityDraft(
                  sessionDraftsRef.current,
                  startedIdentityKeysRef.current,
                  groupingInFlightRef.current,
                ),
              ))
          ) {
            identityKickAgainRef.current = false;
            launchIdentityLoop(false);
          }
        }
      })();
    };

    launchIdentityLoop(true);
  }, [
    accessToken,
    deferIdentity,
    onCatalogMiss,
    onPremiumRequired,
    queueFingerprint,
    setJobId,
    setSelectedSeasonLabel,
  ]);

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
        if (job.status !== "ready") {
          return;
        }
        if (appliedJobId.current === job.jobId) {
          return;
        }
        if (!inFlightDraftId) {
          return;
        }
        await applySuggestions(job, inFlightDraftId);
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
  }, [accessToken, applySuggestions, inFlightDraftId, jobId, polling]);

  const applySuggestion = useCallback(async () => {
    if (!suggestion?.suggestions || !accessToken) {
      return;
    }

    const suggestions = suggestion.suggestions;
    mutate((current) => {
      let next = current;
      if (suggestions.clubId && suggestions.clubLabel) {
        next = setDraftCatalogSide(next, next.activeDraftId, {
          id: suggestions.clubId,
          label: suggestions.clubLabel,
          kind: "club",
        });
      }
      if (suggestions.nationalTeamId && suggestions.nationalTeamLabel) {
        next = setDraftCatalogSide(next, next.activeDraftId, {
          id: suggestions.nationalTeamId,
          label: suggestions.nationalTeamLabel,
          kind: "national_team",
        });
      }
      if (suggestions.seasonId) {
        next = setDraftSeason(
          next,
          next.activeDraftId,
          suggestions.seasonId,
          suggestions.seasonLabel,
        );
      }
      if (suggestions.seasonLabel) {
        setSelectedSeasonLabel(suggestions.seasonLabel);
      }
      if (suggestions.type) {
        next = selectDraftKitType(next, next.activeDraftId, suggestions.type);
      }
      if (suggestions.playerId && suggestions.playerLabel) {
        next = setDraftPlayer(next, next.activeDraftId, {
          id: suggestions.playerId,
          name: suggestions.playerLabel,
          number: suggestions.playerNumber ?? "",
        });
      }
      if (suggestions.patchId && suggestions.patchLabel) {
        next = setDraftBadge(next, next.activeDraftId, {
          id: suggestions.patchId,
          label: suggestions.patchLabel,
        });
      }
      return next;
    });

    const sideId = catalogSideId(suggestions);
    if (sideId) {
      try {
        await fetchClubSeasons(accessToken, sideId);
      } catch {
        // Season list is a Data drill convenience — Brug already wrote the draft.
      }
    }
    setSuggestion(null);
    setApplied(true);
    setCatalogMissHint(null);
    onCatalogMiss?.(false);
  }, [accessToken, mutate, onCatalogMiss, setSelectedSeasonLabel, suggestion]);

  return {
    suggestion,
    catalogMissHint,
    suggestionOpacity,
    bannerState: resolveConfirmVisionBannerState({
      activated: Boolean(accessToken),
      outOfQuota: false,
      analyzing: polling,
      succeeded: applied,
    }),
    applySuggestion,
    dismissSuggestion: () => {
      setSuggestion(null);
    },
  };
}
