import type { CatalogPickerItem, CollectionJersey, CollectionShortcut } from "@kit/api-contract";

export type GenvejeSheetMode = "list" | "form";
export type GenvejeFacetKind = "country" | "league" | "club" | "player";

export type GenvejeFacets = {
  country: CatalogPickerItem | null;
  league: CatalogPickerItem | null;
  club: CatalogPickerItem | null;
  player: CatalogPickerItem | null;
};

const EMPTY_FACETS: GenvejeFacets = {
  country: null,
  league: null,
  club: null,
  player: null,
};

/** Locked Sheet titles from docs/design-system.md Collection shortcuts. */
export function resolveGenvejeSheetTitle(mode: GenvejeSheetMode): string {
  return mode === "list" ? "Genveje" : "Ny genvej";
}

export const GENVEJE_AND_HELPER_COPY =
  "Valgte felter kombineres med OG — en trøje skal matche alle valgte felter.";

export function emptyGenvejeFacets(): GenvejeFacets {
  return { ...EMPTY_FACETS };
}

export function hasAnyGenvejeFacet(facets: GenvejeFacets): boolean {
  return (
    facets.country !== null ||
    facets.league !== null ||
    facets.club !== null ||
    facets.player !== null
  );
}

export function canSaveGenvej(facets: GenvejeFacets, saving: boolean): boolean {
  return hasAnyGenvejeFacet(facets) && !saving;
}

export function buildGenvejeWritePayload(
  facets: GenvejeFacets,
  customName: string,
): {
  name?: string;
  countryId?: string;
  leagueId?: string;
  clubId?: string;
  playerId?: string;
} {
  const payload: {
    name?: string;
    countryId?: string;
    leagueId?: string;
    clubId?: string;
    playerId?: string;
  } = {};

  if (facets.country) {
    payload.countryId = facets.country.id;
  }
  if (facets.league) {
    payload.leagueId = facets.league.id;
  }
  if (facets.club) {
    payload.clubId = facets.club.id;
  }
  if (facets.player) {
    payload.playerId = facets.player.id;
  }

  const trimmedName = customName.trim();
  if (trimmedName) {
    payload.name = trimmedName;
  }

  return payload;
}

function facetLabel(
  label: string | null | undefined,
  kind: GenvejeFacetKind,
  id: string | null,
): string | null {
  if (!id) {
    return null;
  }
  if (label) {
    return label;
  }

  const prefix =
    kind === "country" ? "Land" : kind === "league" ? "Liga" : kind === "club" ? "Klub" : "Spiller";

  return `${prefix} ${id.slice(0, 8)}`;
}

/** Seeds facet pickers when editing an existing genvej. */
export function seedFacetsForEdit(shortcut: CollectionShortcut): GenvejeFacets {
  return {
    country:
      shortcut.countryId !== null
        ? {
            id: shortcut.countryId,
            label:
              facetLabel(shortcut.countryLabel, "country", shortcut.countryId) ??
              shortcut.countryId,
          }
        : null,
    league:
      shortcut.leagueId !== null
        ? {
            id: shortcut.leagueId,
            label:
              facetLabel(shortcut.leagueLabel, "league", shortcut.leagueId) ?? shortcut.leagueId,
          }
        : null,
    club:
      shortcut.clubId !== null
        ? {
            id: shortcut.clubId,
            label: facetLabel(shortcut.clubLabel, "club", shortcut.clubId) ?? shortcut.clubId,
          }
        : null,
    player:
      shortcut.playerId !== null
        ? {
            id: shortcut.playerId,
            label:
              facetLabel(shortcut.playerLabel, "player", shortcut.playerId) ?? shortcut.playerId,
          }
        : null,
  };
}

/** @deprecated Use seedFacetsForEdit — kept for tests migrating from KIT-43. */
export function seedClubForEdit(shortcut: CollectionShortcut): CatalogPickerItem | null {
  return seedFacetsForEdit(shortcut).club;
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

export function resolveFacetPickerTitle(kind: GenvejeFacetKind): string {
  switch (kind) {
    case "country":
      return "Vælg land";
    case "league":
      return "Vælg liga";
    case "club":
      return "Vælg klub";
    case "player":
      return "Vælg spiller";
    default: {
      const neverKind: never = kind;
      return neverKind;
    }
  }
}

export function resolveFacetSearchPlaceholder(kind: GenvejeFacetKind): string {
  switch (kind) {
    case "country":
      return "Søg land";
    case "league":
      return "Søg liga";
    case "club":
      return "Søg klub";
    case "player":
      return "Søg spiller";
    default: {
      const neverKind: never = kind;
      return neverKind;
    }
  }
}

export function resolveFacetFieldLabel(kind: GenvejeFacetKind): string {
  switch (kind) {
    case "country":
      return "Land";
    case "league":
      return "Liga";
    case "club":
      return "Klub";
    case "player":
      return "Spiller";
    default: {
      const neverKind: never = kind;
      return neverKind;
    }
  }
}

type FacetFrequency = {
  id: string;
  label: string;
  count: number;
};

function rankFacetFrequency(rows: FacetFrequency[]): CatalogPickerItem[] {
  return [...rows]
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "da"))
    .map((row) => ({ id: row.id, label: row.label }));
}

/** Mest brugte from the owner's jerseys — never a global ranking. */
export function deriveMostUsedFacets(
  kind: GenvejeFacetKind,
  ownerJerseys: CollectionJersey[],
  _shortcuts: CollectionShortcut[],
): CatalogPickerItem[] {
  const counts = new Map<string, FacetFrequency>();

  const bump = (id: string, label: string) => {
    const existing = counts.get(id);
    if (existing) {
      existing.count += 1;
      return;
    }
    counts.set(id, { id, label, count: 1 });
  };

  if (kind === "club") {
    for (const jersey of ownerJerseys) {
      bump(jersey.clubId, jersey.clubLabel);
    }
  }

  if (kind === "country") {
    for (const jersey of ownerJerseys) {
      bump(jersey.countryId, jersey.countryLabel);
    }
  }

  if (kind === "league") {
    for (const jersey of ownerJerseys) {
      if (jersey.leagueId && jersey.leagueLabel) {
        bump(jersey.leagueId, jersey.leagueLabel);
      }
    }
  }

  if (kind === "player") {
    for (const jersey of ownerJerseys) {
      for (const squadPlayer of jersey.squadPlayers) {
        bump(squadPlayer.id, squadPlayer.label);
      }
    }
  }

  return rankFacetFrequency([...counts.values()]);
}

export function reorderShortcutIds(
  shortcuts: CollectionShortcut[],
  fromIndex: number,
  toIndex: number,
): string[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= shortcuts.length ||
    toIndex >= shortcuts.length ||
    fromIndex === toIndex
  ) {
    return shortcuts.map((shortcut) => shortcut.id);
  }

  const ordered = shortcuts.map((shortcut) => shortcut.id);
  const [moved] = ordered.splice(fromIndex, 1);
  if (!moved) {
    return ordered;
  }
  ordered.splice(toIndex, 0, moved);
  return ordered;
}
