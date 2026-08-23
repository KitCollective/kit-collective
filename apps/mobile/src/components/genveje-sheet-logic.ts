import type { CatalogPickerItem, CollectionShortcut } from "@kit/api-contract";

export type GenvejeSheetMode = "list" | "form";

/** Locked Sheet titles from docs/design-system.md Collection shortcuts. */
export function resolveGenvejeSheetTitle(mode: GenvejeSheetMode): string {
  return mode === "list" ? "Genveje" : "Ny genvej";
}

export function canSaveGenvej(selectedClub: CatalogPickerItem | null, saving: boolean): boolean {
  return selectedClub !== null && !saving;
}

/** Seeds the club picker when editing an existing genvej. */
export function seedClubForEdit(shortcut: CollectionShortcut): CatalogPickerItem | null {
  if (!shortcut.clubId) {
    return null;
  }

  const label =
    shortcut.clubLabel ?? `Klub ${shortcut.clubId.slice(0, 8)}`;

  return { id: shortcut.clubId, label };
}

/** After successful Gem (create or edit), Alle must remain the active chip. */
export function shouldResetToAlleAfterGem(): boolean {
  return true;
}

/** Row manage variant: count is type.mono and included in the accessible name. */
export function manageRowAccessibilityLabel(name: string, matchCount: number): string {
  return `${name}, ${matchCount}`;
}

export function shouldResetShortcutAfterDelete(
  deletedShortcutId: string,
  activeShortcutId: string | null,
): boolean {
  return activeShortcutId !== null && deletedShortcutId === activeShortcutId;
}

export function shouldFallbackToAlleOnFetchError(
  status: number,
  selectedShortcutId: string | null,
): boolean {
  return status === 404 && selectedShortcutId !== null;
}
