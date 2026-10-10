import { completeOverviewDraft, unsavedDraftCount } from "./captureOverview";
import { addJerseyDraft, applyStickySizeToUnselected, removeDraft } from "./captureSession";
import type { CaptureJerseyDraft, CaptureSessionState } from "./captureSessionTypes";

export type BulkSaveAdvance =
  /** Saved from the bulk overview: `remaining` jerseys are still unsaved. */
  | { status: "overview-continue"; remaining: number }
  | { status: "bulk-continue" }
  /** The last jersey of a plain bulk session is saved: the session is over. */
  | { status: "session-done" };

/**
 * What a saved jersey does to a bulk session. The bulk overview keeps it as a Gemt row and moves
 * on to the next unsaved jersey; a plain bulk session just drops it. It runs over `mutate` only,
 * so the outcome Confirm acts on (stay, advance, or return to the overview) is tested without a
 * network.
 */
export function advanceBulkSessionAfterSave(input: {
  draft: CaptureJerseyDraft;
  stickySize: CaptureJerseyDraft["size"];
  mutate: (
    updater: (current: CaptureSessionState) => CaptureSessionState,
  ) => CaptureSessionState | null;
}): BulkSaveAdvance {
  const nextState = input.mutate((current) => {
    let next = current.overview
      ? completeOverviewDraft(current, input.draft.id)
      : removeDraft(current, input.draft.id);
    if (!current.overview && next.drafts.length === 0 && next.unboundUris.length > 0) {
      next = addJerseyDraft(next, { defaultSize: input.stickySize });
    }
    return input.stickySize ? applyStickySizeToUnselected(next, input.stickySize) : next;
  });

  if (nextState?.overview) {
    return { status: "overview-continue", remaining: unsavedDraftCount(nextState) };
  }
  if (!nextState || nextState.drafts.length === 0) {
    return { status: "session-done" };
  }
  return { status: "bulk-continue" };
}
