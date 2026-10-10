import { KIT_TYPE_LABELS_DA, type KitType } from "@kit/domain";

export type ConfirmSheetKind = "club" | "season" | "details";

/** Only one Confirm picker sheet may be open at a time. */
export function openConfirmSheet(
  _current: ConfirmSheetKind | null,
  next: ConfirmSheetKind,
): ConfirmSheetKind {
  return next;
}

export function closeConfirmSheet(
  current: ConfirmSheetKind | null,
  kind: ConfirmSheetKind,
): ConfirmSheetKind | null {
  return current === kind ? null : current;
}

/** Club selection closes the club sheet; season opens only after that dismiss completes. */
export function shouldOpenSeasonAfterClubDismiss(
  pending: boolean,
  dismissedKind: ConfirmSheetKind,
): boolean {
  return pending && dismissedKind === "club";
}

type SavedSheetPhoto = { role: string; photoUrl: string };

/** Front photo of the saved jersey; falls back to the first photo. */
export function pickSavedFrontPhoto<T extends SavedSheetPhoto>(photos: readonly T[]): T | null {
  return photos.find((photo) => photo.role === "front") ?? photos[0] ?? null;
}

export type SavedSheetModel = {
  title: string;
  summary: string;
  countLine: string | null;
  nextLabel: string;
  sameSideLabel: string | null;
  sameSide: { id: string; label: string } | null;
  collectionLabel: string;
};

/** Saved sheet content (design-system.md → Confirm and Save, Revision 2026-10-09, item 8). */
export function buildSavedSheetModel(input: {
  club: { id: string; label: string } | null;
  seasonLabel: string | null;
  kitType: KitType | null;
  count: number | null;
}): SavedSheetModel {
  const summary = [
    input.club?.label,
    input.seasonLabel,
    input.kitType ? KIT_TYPE_LABELS_DA[input.kitType] : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  return {
    title: "Gemt",
    summary,
    countLine: input.count !== null ? `Trøje nr. ${input.count} i din samling` : null,
    nextLabel: "Tilføj næste trøje",
    sameSideLabel: input.club ? `Endnu en ${input.club.label}` : null,
    sameSide: input.club ? { id: input.club.id, label: input.club.label } : null,
    collectionLabel: "Se samlingen",
  };
}
