import { type CatalogPickerItem, omitDevCatalogFixtureRows } from "@kit/api-contract";
import type { CatalogPickerRow } from "@/catalog/catalogPickerRow";

export const CATALOG_SEARCH_ERROR_MESSAGE = "Kunne ikke søge i kataloget.";

export type LivePickerResult = {
  items: CatalogPickerRow[];
  errorMessage: string | null;
};

export function resolveClubPickerRows(input: {
  authenticated: boolean;
  live: CatalogPickerRow[] | null;
  liveFailed: boolean;
}): LivePickerResult {
  if (!input.authenticated) {
    return { items: [], errorMessage: null };
  }
  if (input.liveFailed) {
    return { items: [], errorMessage: CATALOG_SEARCH_ERROR_MESSAGE };
  }
  if (input.live) {
    return { items: omitDevCatalogFixtureRows(input.live), errorMessage: null };
  }
  return { items: [], errorMessage: null };
}

export function resolvePlayerPickerRows(input: {
  clubId: string | null;
  live: CatalogPickerRow[] | null;
  liveFailed: boolean;
}): LivePickerResult {
  if (!input.clubId) {
    return { items: [], errorMessage: null };
  }
  if (input.liveFailed) {
    return { items: [], errorMessage: CATALOG_SEARCH_ERROR_MESSAGE };
  }
  if (input.live) {
    return { items: omitDevCatalogFixtureRows(input.live), errorMessage: null };
  }
  return { items: [], errorMessage: null };
}

export function resolveSeasonPickerRows(input: {
  liveSeasons?: CatalogPickerItem[];
}): CatalogPickerRow[] {
  if (!input.liveSeasons) {
    return [];
  }
  return omitDevCatalogFixtureRows(
    input.liveSeasons.map((season) => ({ id: season.id, label: season.label })),
  );
}

export function pickerRowSquadNumber(row: CatalogPickerRow): string {
  const match = row.meta?.match(/^Nr\.\s*(.+)$/);
  return match?.[1] ?? "";
}
