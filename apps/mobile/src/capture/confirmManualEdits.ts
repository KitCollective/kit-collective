import type { IdentityManualEditMask } from "./identitySuggestOnly";

/**
 * Fields the collector hand-edited, per jersey. The confirm screens mark against the visible
 * jersey (`setConfirmManualEditsDraft`); a Vision result for any jersey reads that jersey's own
 * entry, like the Vision state in `identityDraftState.ts`.
 */
const editsByDraft = new Map<string, IdentityManualEditMask>();
let visibleDraftId: string | null = null;

export function setConfirmManualEditsDraft(draftId: string | null): void {
  visibleDraftId = draftId;
}

/** Forgets one jersey's edits, or every jersey's when no id is given. */
export function resetConfirmManualEdits(draftId?: string): void {
  if (draftId === undefined) {
    editsByDraft.clear();
    return;
  }
  editsByDraft.delete(draftId);
}

function setVisibleEdit(field: keyof IdentityManualEditMask, edited: boolean): void {
  if (!visibleDraftId) {
    return;
  }
  editsByDraft.set(visibleDraftId, { ...editsByDraft.get(visibleDraftId), [field]: edited });
}

export function markConfirmClubEdited(): void {
  setVisibleEdit("club", true);
}

export function clearConfirmSeasonEdited(): void {
  setVisibleEdit("season", false);
}

export function markConfirmSeasonEdited(): void {
  setVisibleEdit("season", true);
}

export function markConfirmKitTypeEdited(): void {
  setVisibleEdit("type", true);
}

export function markConfirmPlayerEdited(): void {
  setVisibleEdit("player", true);
}

export function markConfirmBadgeEdited(): void {
  setVisibleEdit("badge", true);
}

export function confirmManualEditMask(draftId: string): IdentityManualEditMask {
  return { ...editsByDraft.get(draftId) };
}
