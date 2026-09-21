import type { CaptureJerseyDraft } from "./captureSessionTypes";
import { draftPhotoFingerprint } from "./confirmVisionScope";

export function identityRunKey(draft: CaptureJerseyDraft): string {
  return `${draft.id}:${draftPhotoFingerprint(draft) ?? ""}`;
}

/** Confirm tabs are `drafts` order — jersey 1, then 2, then 3. Skip empty drafts. */
export function orderedIdentityDrafts(
  drafts: ReadonlyArray<CaptureJerseyDraft>,
): CaptureJerseyDraft[] {
  return drafts.filter((draft) => draft.photos.length > 0);
}

export function identityQueueFingerprint(drafts: ReadonlyArray<CaptureJerseyDraft>): string {
  return orderedIdentityDrafts(drafts)
    .map((draft) => identityRunKey(draft))
    .join("|");
}

/**
 * Next jersey to identify, always the leftmost tab that has not started.
 * Never prefers the active/last-filled tab over jersey 1.
 */
export function nextQueuedIdentityDraft(
  drafts: ReadonlyArray<CaptureJerseyDraft>,
  startedKeys: ReadonlySet<string>,
): CaptureJerseyDraft | undefined {
  return orderedIdentityDrafts(drafts).find((draft) => !startedKeys.has(identityRunKey(draft)));
}

export const IDENTITY_TIMEOUT_ERROR = "IDENTITY_TIMEOUT";

/** Photo prepare, POST, and poll share one budget so a hang cannot lock Confirm on jersey 1. */
export function remainingIdentityBudget(
  startedAt: number,
  budgetMs: number,
  now = Date.now(),
): number {
  return budgetMs - (now - startedAt);
}

export function raceWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  if (ms <= 0) {
    return Promise.reject(new Error(IDENTITY_TIMEOUT_ERROR));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(IDENTITY_TIMEOUT_ERROR)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Skeleton stops without claiming a catalog miss. */
export function identitySettledSnapshot(): {
  fieldPreselect: Record<string, never>;
  suggestions: null;
  catalogMiss: false;
} {
  return { fieldPreselect: {}, suggestions: null, catalogMiss: false };
}

/** Data chrome follows the open tab — identity never steals the active draft. */
export function shouldSyncIdentityChrome(
  inFlightDraftId: string | null,
  activeDraftId: string | null,
): boolean {
  return inFlightDraftId !== null && inFlightDraftId === activeDraftId;
}

/**
 * Hold identity only until the first grouped jersey has photos.
 * Grouping reveal of jersey 2 and 3 must not block jersey 1's match.
 */
export function shouldHoldIdentityForGrouping(input: {
  groupingInFlight: boolean;
  boundDraftCount: number;
}): boolean {
  return input.groupingInFlight && input.boundDraftCount === 0;
}

/** Kick the queue when a jersey gains photos — including mid-grouping — not on tab switches. */
export function shouldAttemptIdentityQueue(input: {
  deferIdentity: boolean;
  hasAccessToken: boolean;
  queueFingerprint: string;
  previousFingerprint: string | null;
  groupingJustClosed: boolean;
}): boolean {
  if (input.deferIdentity || !input.hasAccessToken || input.queueFingerprint.length === 0) {
    return false;
  }
  if (input.groupingJustClosed) {
    return true;
  }
  if (input.previousFingerprint === null) {
    return true;
  }
  return input.previousFingerprint !== input.queueFingerprint;
}
