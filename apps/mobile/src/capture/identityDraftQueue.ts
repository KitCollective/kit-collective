import type { CaptureJerseyDraft } from "./captureSessionTypes";
import { draftPhotoFingerprint } from "./confirmVisionScope";

export function identityRunKey(draft: CaptureJerseyDraft): string {
  return `${draft.id}:${draftPhotoFingerprint(draft) ?? ""}`;
}

/** A draft is ready for identity as soon as it holds a photo. */
export function isDraftReadyForIdentityJob(draft: CaptureJerseyDraft): boolean {
  return draft.photos.length > 0;
}

/** Confirm tabs are `drafts` order — jersey 1, then 2, then 3. Skip drafts with no photos. */
export function orderedIdentityDrafts(
  drafts: ReadonlyArray<CaptureJerseyDraft>,
): CaptureJerseyDraft[] {
  return drafts.filter((draft) => isDraftReadyForIdentityJob(draft));
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

/** Kick the queue when a jersey gains photos, not on tab switches. */
export function shouldAttemptIdentityQueue(input: {
  hasAccessToken: boolean;
  queueFingerprint: string;
  previousFingerprint: string | null;
}): boolean {
  if (!input.hasAccessToken || input.queueFingerprint.length === 0) {
    return false;
  }
  if (input.previousFingerprint === null) {
    return true;
  }
  return input.previousFingerprint !== input.queueFingerprint;
}
