import { type OverviewRow, overviewRows } from "./captureOverview";
import { canAddPhotoToDraft } from "./captureSession";
import type { CaptureSessionState } from "./captureSessionTypes";

/**
 * Fotos uden trøje: the full-screen place where the collector sorts loose photos by hand
 * (docs/design-system.md, Capture session, Revision 2026-10-09, item 5). Pure so the pick order,
 * dock words and picker rows have unit tests.
 */

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

/** Appends on select, removes on deselect. The list is pick order, so index + 1 is the badge. */
export function toggleSelection(selection: readonly string[], uri: string): string[] {
  return selection.includes(uri) ? selection.filter((entry) => entry !== uri) : [...selection, uri];
}

/** The number on a selected photo, `null` when it is not selected. */
export function selectionBadge(selection: readonly string[], uri: string): number | null {
  const index = selection.indexOf(uri);
  return index === -1 ? null : index + 1;
}

export type UnassignedDockModel = {
  primary: { label: string; disabled: boolean };
  addToDraft: { label: string; disabled: boolean };
  discard: { label: string; disabled: boolean };
};

/**
 * Every action works on the selection, so all three wait for one photo. **Læg til en trøje** also
 * waits for a jersey to add to: a picker with no rows would be a dead end.
 */
export function unassignedDock(selectedCount: number, hasJersey: boolean): UnassignedDockModel {
  const disabled = selectedCount === 0;
  return {
    primary: {
      label: disabled ? "Ny trøje" : `Ny trøje af ${plural(selectedCount, "foto", "fotos")}`,
      disabled,
    },
    addToDraft: { label: "Læg til en trøje", disabled: disabled || !hasJersey },
    discard: { label: "Slet", disabled },
  };
}

/** `caption` under the picker Sheet's title. */
export function selectedCaption(selectedCount: number): string {
  return `${plural(selectedCount, "foto", "fotos")} valgt`;
}

export function deleteConfirmCopy(selectedCount: number): {
  title: string;
  consequence: string;
  confirmLabel: string;
} {
  return {
    title: `Slet ${plural(selectedCount, "foto", "fotos")}?`,
    consequence: "Fotoene fjernes fra denne session. Det kan ikke fortrydes.",
    confirmLabel: "Slet",
  };
}

export type DraftPickerRow = {
  draftId: string;
  title: string;
  /** Season · type · photo count. */
  meta: string;
  thumbUri: string | null;
  /** At 10 photos: dimmed, **Fuld**, and no press. */
  full: boolean;
  /** The shared overview row shape, with the trailing slot set for this Sheet. */
  row: OverviewRow;
};

/** One row per jersey in this session that holds photos. A draft without photos is not listed. */
export function draftPickerRows(state: CaptureSessionState): DraftPickerRow[] {
  const rows: DraftPickerRow[] = [];
  for (const row of overviewRows(state)) {
    const draft = row.kind === "draft" ? state.drafts.find((d) => d.id === row.draftId) : null;
    if (!draft) {
      continue;
    }
    // The overview shows the photo count in place of a missing identity: do not say it twice.
    const named = Boolean(draft.seasonLabel || draft.kitType);
    const meta = named ? `${row.meta} · ${plural(draft.photos.length, "foto", "fotos")}` : row.meta;
    const full = !canAddPhotoToDraft(draft);
    rows.push({
      draftId: draft.id,
      title: row.title,
      meta,
      thumbUri: row.thumbUri,
      full,
      row: { ...row, meta, status: "ready", statusLabel: full ? "Fuld" : null },
    });
  }
  return rows;
}

/** Selected photos still without a jersey after an action: a bind stops at the 10-photo cap. */
export function leftBehindCount(selection: readonly string[], state: CaptureSessionState): number {
  return selection.filter((uri) => state.unboundUris.includes(uri)).length;
}

/**
 * The one way out. An empty grid leaves for the overview, where the new jerseys wait. A session
 * that is gone leaves for Samling, as Confirm does. `null` while there is still something to sort
 * or the session has not loaded.
 */
export function unassignedExit(
  state: CaptureSessionState | null,
  isSessionResolved: boolean,
): "overview" | "collection" | null {
  if (!isSessionResolved) {
    return null;
  }
  if (!state) {
    return "collection";
  }
  return state.unboundUris.length === 0 ? "overview" : null;
}
