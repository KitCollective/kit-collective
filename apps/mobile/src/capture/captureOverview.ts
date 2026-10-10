import { KIT_TYPE_LABELS_DA } from "@kit/domain";
import { appendSavedDraft, canSave, removeDraft, setActiveDraft } from "./captureSession";
import type {
  CaptureBranch,
  CaptureJerseyDraft,
  CaptureSavedDraft,
  CaptureSessionState,
} from "./captureSessionTypes";

/**
 * The bulk overview: a place inside the capture modal, before Confirm, for four or more photos
 * with Vision on (docs/design-system.md, Capture session, Revision 2026-10-09, items 3 and 4).
 * Everything here is pure so the ordering, status words and parked-row copy have unit tests.
 */

/** Four or more photos is the `bulk` branch. Vision off lands on Confirm as before. */
export function shouldOpenBulkOverview(input: {
  branch: CaptureBranch;
  visionOn: boolean;
}): boolean {
  return input.visionOn && input.branch === "bulk";
}

/** Signed in with quota left. Same reading as Confirm's own Vision gate. */
export function visionOnForCapture(input: {
  accessToken: string | null;
  outOfQuota: boolean;
}): boolean {
  return Boolean(input.accessToken) && !input.outOfQuota;
}

export type OverviewRowStatus = "check" | "incomplete" | "ready" | "saved";

export type OverviewRow = {
  kind: "draft" | "saved";
  draftId: string;
  status: OverviewRowStatus;
  /** Trailing word. `null` for a jersey that only waits for Gem. */
  statusLabel: string | null;
  title: string;
  /** Season · type, or the photo count while Vision has not named the jersey. */
  meta: string;
  thumbUri: string | null;
};

/** The only trailing words the lock has: Tjek, Str. og stand, Gemt (Capture session, item 3). */
const STATUS_INCOMPLETE = "Str. og stand";

const STATUS_RANK: Record<OverviewRowStatus, number> = {
  check: 0,
  incomplete: 1,
  ready: 2,
  saved: 3,
};

export function draftOverviewStatus(
  draft: CaptureJerseyDraft,
): Exclude<OverviewRowStatus, "saved"> {
  if (draft.needsCheck) {
    return "check";
  }
  return canSave(draft) ? "ready" : "incomplete";
}

function photoCountLabel(count: number): string {
  return count === 1 ? "1 foto" : `${count} fotos`;
}

function draftThumb(draft: CaptureJerseyDraft): string | null {
  const front = draft.photos.find((photo) => (photo.role ?? "front") === "front");
  return (front ?? draft.photos[0])?.uri ?? null;
}

function joinMeta(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

function draftRow(draft: CaptureJerseyDraft, position: number): OverviewRow {
  const status = draftOverviewStatus(draft);
  const kit = draft.kitType ? KIT_TYPE_LABELS_DA[draft.kitType] : null;
  return {
    kind: "draft",
    draftId: draft.id,
    status,
    statusLabel: status === "check" ? "Tjek" : status === "incomplete" ? STATUS_INCOMPLETE : null,
    title: draft.clubLabel ?? draft.nationalTeamLabel ?? `Trøje ${position}`,
    meta: joinMeta([draft.seasonLabel, kit]) || photoCountLabel(draft.photos.length),
    thumbUri: draftThumb(draft),
  };
}

function savedRow(saved: CaptureSavedDraft, position: number): OverviewRow {
  const kit = saved.kitType ? KIT_TYPE_LABELS_DA[saved.kitType] : null;
  return {
    kind: "saved",
    draftId: saved.draftId,
    status: "saved",
    statusLabel: "Gemt",
    title: saved.clubLabel ?? `Trøje ${position}`,
    meta: joinMeta([saved.seasonLabel, kit]),
    thumbUri: saved.thumbUri,
  };
}

/** Drafts that hold photos. An empty draft is not a jersey the collector has to deal with. */
function draftsWithPhotos(state: CaptureSessionState): CaptureJerseyDraft[] {
  return state.drafts.filter((draft) => draft.photos.length > 0);
}

/** Rows in the order the collector reads them: check first, then incomplete, then saved. */
export function overviewRows(state: CaptureSessionState): OverviewRow[] {
  const draftRows = draftsWithPhotos(state).map((draft, index) => draftRow(draft, index + 1));
  const offset = draftRows.length;
  const savedRows = (state.savedDrafts ?? []).map((saved, index) =>
    savedRow(saved, offset + index + 1),
  );
  return [...draftRows, ...savedRows]
    .map((row, index) => ({ row, index }))
    .sort((a, b) => STATUS_RANK[a.row.status] - STATUS_RANK[b.row.status] || a.index - b.index)
    .map((entry) => entry.row);
}

function unsavedRows(state: CaptureSessionState): OverviewRow[] {
  return overviewRows(state).filter((row) => row.kind === "draft");
}

export function unsavedDraftCount(state: CaptureSessionState): number {
  return draftsWithPhotos(state).length;
}

/** Gennemgå: the first row that is not saved. */
export function firstUnsavedDraftId(state: CaptureSessionState): string | null {
  return unsavedRows(state)[0]?.draftId ?? null;
}

/** Gem og næste: the unsaved row after this one, wrapping to the top, never the same draft. */
export function nextUnsavedDraftId(
  state: CaptureSessionState,
  afterDraftId: string,
): string | null {
  const rows = unsavedRows(state);
  const index = rows.findIndex((row) => row.draftId === afterDraftId);
  const following = [...rows.slice(index + 1), ...rows.slice(0, Math.max(index, 0))];
  return following.find((row) => row.draftId !== afterDraftId)?.draftId ?? null;
}

/**
 * A jersey saved from the overview leaves the drafts and becomes a Gemt row; the next unsaved
 * jersey becomes active so Confirm can advance to it.
 */
export function completeOverviewDraft(
  state: CaptureSessionState,
  draftId: string,
): CaptureSessionState {
  const draft = state.drafts.find((entry) => entry.id === draftId);
  if (!draft) {
    return state;
  }
  const nextId = nextUnsavedDraftId(state, draftId);
  let next = appendSavedDraft(state, {
    draftId,
    thumbUri: draftThumb(draft),
    clubLabel: draft.clubLabel ?? draft.nationalTeamLabel,
    seasonLabel: draft.seasonLabel,
    kitType: draft.kitType,
  });
  next = removeDraft(next, draftId);
  return nextId ? setActiveDraft(next, nextId) : next;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

/**
 * Title of the overview. While Vision runs: **Sorterer 16 fotos**. When it found jerseys:
 * **6 trøjer fundet**. When it found none (it did not answer, or nothing grouped): **16 fotos er
 * gemt** (Revision 2026-10-09, item 6), never "0 trøjer fundet".
 */
export function overviewTitle(input: {
  analyzing: boolean;
  totalPhotos: number;
  jerseyCount: number;
}): string {
  if (input.analyzing) {
    return `Sorterer ${plural(input.totalPhotos, "foto", "fotos")}`;
  }
  if (input.jerseyCount === 0) {
    return `${plural(input.totalPhotos, "foto", "fotos")} er gemt`;
  }
  return `${plural(input.jerseyCount, "trøje", "trøjer")} fundet`;
}

/** `mono` line under the title. `null` while Vision runs: the lock gives it no line there. */
export function overviewCaption(input: {
  analyzing: boolean;
  failed: boolean;
  totalPhotos: number;
  jerseyCount: number;
}): string | null {
  if (input.analyzing) {
    return null;
  }
  if (input.jerseyCount === 0) {
    return input.failed ? "Vision svarede ikke" : plural(input.totalPhotos, "foto", "fotos");
  }
  return `${plural(input.totalPhotos, "foto", "fotos")} · sorteret`;
}

/** Share of the photos that already sit on a jersey. */
export function overviewProgress(input: { totalPhotos: number; unboundCount: number }): number {
  if (input.totalPhotos <= 0) {
    return 0;
  }
  const placed = Math.max(0, input.totalPhotos - input.unboundCount);
  return Math.min(1, placed / input.totalPhotos);
}

const SKELETON_ROWS_MAX = 3;
const PHOTOS_PER_PENDING_ROW = 3;

/** Rows still to land while Vision runs. A guess from the pile, since Vision gives no count. */
export function pendingSkeletonRows(input: { analyzing: boolean; unboundCount: number }): number {
  if (!input.analyzing || input.unboundCount <= 0) {
    return 0;
  }
  return Math.min(SKELETON_ROWS_MAX, Math.ceil(input.unboundCount / PHOTOS_PER_PENDING_ROW));
}

const THUMBS_MAX = 3;

export type InboxRowModel = {
  count: number;
  label: string;
  pill: "Sortér";
  thumbUris: string[];
};

/** Photos without a jersey. Present only when there are any. */
export function inboxRow(state: CaptureSessionState): InboxRowModel | null {
  const count = state.unboundUris.length;
  if (count === 0) {
    return null;
  }
  return {
    count,
    label: `${plural(count, "foto", "fotos")} uden trøje`,
    pill: "Sortér",
    thumbUris: state.unboundUris.slice(0, THUMBS_MAX),
  };
}

export type OverviewDockModel = {
  primary: { label: string; disabled: boolean };
  tertiary: string | null;
};

export function overviewDock(input: {
  analyzing: boolean;
  /** Vision did not answer and nothing was found. */
  failed: boolean;
  unsavedCount: number;
  firstTitle: string | null;
}): OverviewDockModel {
  if (input.analyzing) {
    return {
      primary: {
        label: `Start med ${input.firstTitle ?? "første trøje"}`,
        disabled: input.unsavedCount === 0,
      },
      tertiary: "Sortér selv i stedet",
    };
  }
  if (input.failed && input.unsavedCount === 0) {
    return {
      primary: { label: "Prøv Vision igen", disabled: false },
      tertiary: "Sortér selv",
    };
  }
  if (input.unsavedCount === 0) {
    // Every jersey is saved. "Se samlingen" is the label the Saved sheet already locks (item 8).
    return { primary: { label: "Se samlingen", disabled: false }, tertiary: null };
  }
  return {
    primary: {
      label: `Gennemgå ${plural(input.unsavedCount, "trøje", "trøjer")}`,
      disabled: false,
    },
    tertiary: "Gør resten færdig senere",
  };
}

/**
 * What leaving the overview does with the session, whichever way the collector leaves (Luk, the
 * parked tertiary button, Android back, a swipe): keep it as the parked row while anything is
 * left to do, drop it once every jersey is saved and no photo is loose.
 */
export function overviewLeaveAction(state: CaptureSessionState): "park" | "clear" {
  return unsavedDraftCount(state) > 0 || state.unboundUris.length > 0 ? "park" : "clear";
}

export type ParkedRowModel = {
  sessionId: string;
  title: string;
  caption: string;
  pill: "Fortsæt";
  thumbUris: string[];
};

function dayStart(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

const DAY_MS = 24 * 60 * 60 * 1000;

function ageCaption(parkedAt: number, now: number): string {
  const days = Math.round((dayStart(now) - dayStart(parkedAt)) / DAY_MS);
  if (days <= 0) {
    return "Fra i dag";
  }
  return days === 1 ? "Fra i går" : `Fra ${days} dage siden`;
}

function looseLabel(count: number): string {
  return count === 1 ? "1 løst foto" : `${count} løse fotos`;
}

/** Samling's one parked row. `null` unless the session is parked and still has something to do. */
export function parkedRow(state: CaptureSessionState, now: number): ParkedRowModel | null {
  if (state.parkedAt == null) {
    return null;
  }
  const missing = draftsWithPhotos(state);
  const loose = state.unboundUris.length;
  if (missing.length === 0 && loose === 0) {
    return null;
  }

  const age = ageCaption(state.parkedAt, now);
  if (missing.length === 0) {
    return {
      sessionId: state.sessionId,
      title: `${plural(loose, "foto", "fotos")} uden trøje`,
      caption: age,
      pill: "Fortsæt",
      thumbUris: state.unboundUris.slice(0, THUMBS_MAX),
    };
  }

  const thumbs = missing
    .map((draft) => draftThumb(draft))
    .filter((uri): uri is string => uri !== null)
    .slice(0, THUMBS_MAX);
  return {
    sessionId: state.sessionId,
    title: `${plural(missing.length, "trøje", "trøjer")} mangler`,
    caption: joinMeta([age, loose > 0 ? looseLabel(loose) : null]),
    pill: "Fortsæt",
    thumbUris: thumbs,
  };
}
