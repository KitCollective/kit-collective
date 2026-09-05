export type ConfirmSheetKind = "club" | "season" | "details";

/** Only one Confirm picker sheet may be open at a time. */
export function openConfirmSheet(_current: ConfirmSheetKind | null, next: ConfirmSheetKind): ConfirmSheetKind {
  return next;
}

export function closeConfirmSheet(
  current: ConfirmSheetKind | null,
  kind: ConfirmSheetKind,
): ConfirmSheetKind | null {
  return current === kind ? null : current;
}

/** Club selection closes the club sheet; season opens only after that dismiss completes. */
export function shouldOpenSeasonAfterClubDismiss(pending: boolean, dismissedKind: ConfirmSheetKind): boolean {
  return pending && dismissedKind === "club";
}
