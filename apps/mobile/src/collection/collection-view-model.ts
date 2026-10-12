import type { CollectionJersey } from "@kit/api-contract";
import { JERSEY_SIZE_LABELS_DA, KIT_TYPE_LABELS_DA } from "@kit/domain";
import { jerseyTileMetaLine } from "@/components/jersey-tile-meta";

/**
 * Pure Samling view-model (docs/design-system.md → Patterns → Collection grid, Revision
 * 2026-10-10): jerseys + shortcut + view + sort in, facts, groups and tile captions out.
 * No React Native import, so it is tested without rendering.
 */

export const COLLECTION_VIEWS = ["all", "open", "bids", "private"] as const;
export type CollectionView = (typeof COLLECTION_VIEWS)[number];

export const COLLECTION_SORTS = ["latest", "club", "seasonNewest", "seasonOldest"] as const;
export type CollectionSort = (typeof COLLECTION_SORTS)[number];

export const COLLECTION_VIEW_LABELS_DA: Record<CollectionView, string> = {
  all: "Alle",
  open: "Åbne for bud",
  bids: "Med bud",
  private: "Private",
};

export const COLLECTION_SORT_LABELS_DA: Record<CollectionSort, string> = {
  latest: "Senest tilføjet",
  club: "Klub A–Å",
  seasonNewest: "Sæson nyeste først",
  seasonOldest: "Sæson ældste først",
};

export type CollectionFacts = {
  jerseyCount: number;
  /** Clubs and national teams together, distinct. */
  clubCount: number;
  /** Start year of the earliest season; null when no season label has one. */
  oldestSeasonYear: number | null;
};

export type CollectionTileBadge = { kind: "bids"; count: number } | { kind: "lock" };

export type CollectionTile = {
  id: string;
  jersey: CollectionJersey;
  /** Club (heading-sm) outside club sort; season (mono) in club sort. */
  primaryLead: string;
  /** Size, trailing on the first caption line. */
  primaryTrailing: string;
  /** season · type outside club sort; type · player in club sort. */
  secondaryLine: string;
  badge: CollectionTileBadge | null;
};

export type CollectionGroup = {
  key: string;
  /** Club or national team name in club sort; null (no heading) in every other sort. */
  label: string | null;
  count: number;
  tiles: CollectionTile[];
};

export type CollectionViewResult = {
  facts: CollectionFacts | null;
  /** Count of each view over the list already narrowed by the shortcut. */
  viewCounts: Record<CollectionView, number>;
  groups: CollectionGroup[];
};

export type CollectionListRow =
  | { kind: "heading"; key: string; label: string; count: number }
  | { kind: "row"; key: string; tiles: CollectionTile[] };

const SEASON_START_YEAR = /^(\d{4})/;

/** Start year = the leading four digits of the season label (`2023/24`, `2010`). */
export function seasonStartYear(seasonLabel: string): number | null {
  const match = SEASON_START_YEAR.exec(seasonLabel);
  return match?.[1] ? Number.parseInt(match[1], 10) : null;
}

function clubKey(jersey: CollectionJersey): string {
  return jersey.clubId ?? jersey.nationalTeamId ?? jersey.id;
}

function clubName(jersey: CollectionJersey): string {
  return jersey.clubLabel ?? jersey.nationalTeamLabel ?? "";
}

function unansweredBids(jersey: CollectionJersey): number {
  return jersey.unansweredBidCount ?? 0;
}

function matchesView(jersey: CollectionJersey, view: CollectionView): boolean {
  switch (view) {
    case "all":
      return true;
    case "open":
      return jersey.biddingEnabled;
    case "bids":
      return unansweredBids(jersey) > 0;
    case "private":
      return jersey.private;
  }
}

function buildFacts(allJerseys: CollectionJersey[]): CollectionFacts | null {
  if (allJerseys.length === 0) {
    return null;
  }
  const clubs = new Set<string>();
  let oldest: number | null = null;
  for (const jersey of allJerseys) {
    clubs.add(clubKey(jersey));
    const year = seasonStartYear(jersey.seasonLabel);
    if (year !== null && (oldest === null || year < oldest)) {
      oldest = year;
    }
  }
  return { jerseyCount: allJerseys.length, clubCount: clubs.size, oldestSeasonYear: oldest };
}

function badgeFor(jersey: CollectionJersey): CollectionTileBadge | null {
  const count = unansweredBids(jersey);
  if (count > 0) {
    return { kind: "bids", count };
  }
  return jersey.private ? { kind: "lock" } : null;
}

function buildTile(jersey: CollectionJersey, sort: CollectionSort): CollectionTile {
  const typeLabel = KIT_TYPE_LABELS_DA[jersey.type];
  const sizeLabel = JERSEY_SIZE_LABELS_DA[jersey.size];
  const byClub = sort === "club";
  return {
    id: jersey.id,
    jersey,
    primaryLead: byClub ? jersey.seasonLabel : clubName(jersey),
    primaryTrailing: sizeLabel,
    secondaryLine: byClub
      ? jersey.playerLabel
        ? `${typeLabel} · ${jersey.playerLabel}`
        : typeLabel
      : jerseyTileMetaLine(jersey.seasonLabel, typeLabel),
    badge: badgeFor(jersey),
  };
}

/** Season sorts by start year; a label without one sorts last in both directions. */
function bySeason(direction: 1 | -1) {
  return (left: CollectionJersey, right: CollectionJersey): number => {
    const a = seasonStartYear(left.seasonLabel);
    const b = seasonStartYear(right.seasonLabel);
    if (a === null && b === null) {
      return 0;
    }
    if (a === null) {
      return 1;
    }
    if (b === null) {
      return -1;
    }
    return (a - b) * direction;
  };
}

function groupByClub(tiles: CollectionTile[]): CollectionGroup[] {
  const byKey = new Map<string, CollectionGroup>();
  for (const tile of tiles) {
    const key = clubKey(tile.jersey);
    const group = byKey.get(key) ?? { key, label: clubName(tile.jersey), count: 0, tiles: [] };
    group.tiles.push(tile);
    group.count += 1;
    byKey.set(key, group);
  }
  return [...byKey.values()].sort((left, right) =>
    (left.label ?? "").localeCompare(right.label ?? "", "da"),
  );
}

export function buildCollectionView(input: {
  /** The whole collection: facts read this, whatever the shortcut or the view. */
  allJerseys: CollectionJersey[];
  /** The list already narrowed by the selected shortcut. */
  jerseys: CollectionJersey[];
  view: CollectionView;
  sort: CollectionSort;
}): CollectionViewResult {
  const { allJerseys, jerseys, view, sort } = input;

  const countOf = (candidate: CollectionView) =>
    jerseys.filter((jersey) => matchesView(jersey, candidate)).length;
  const viewCounts: Record<CollectionView, number> = {
    all: countOf("all"),
    open: countOf("open"),
    bids: countOf("bids"),
    private: countOf("private"),
  };

  const filtered = jerseys.filter((jersey) => matchesView(jersey, view));
  // Array.prototype.sort is stable: ties keep the order the API returned (latest added).
  const ordered =
    sort === "seasonNewest"
      ? [...filtered].sort(bySeason(-1))
      : sort === "seasonOldest"
        ? [...filtered].sort(bySeason(1))
        : filtered;
  const tiles = ordered.map((jersey) => buildTile(jersey, sort));

  const groups: CollectionGroup[] =
    sort === "club"
      ? groupByClub(tiles)
      : tiles.length === 0
        ? []
        : [{ key: "all", label: null, count: tiles.length, tiles }];

  return { facts: buildFacts(allJerseys), viewCounts, groups };
}

/**
 * `numColumns={2}` cannot hold a heading, so the list is one flat array of heading and
 * two-tile rows. Every group starts on a new row.
 */
export function toListRows(groups: CollectionGroup[], columns = 2): CollectionListRow[] {
  const rows: CollectionListRow[] = [];
  for (const group of groups) {
    if (group.label !== null) {
      rows.push({
        kind: "heading",
        key: `heading-${group.key}`,
        label: group.label,
        count: group.count,
      });
    }
    for (let index = 0; index < group.tiles.length; index += columns) {
      const tiles = group.tiles.slice(index, index + columns);
      rows.push({ kind: "row", key: `row-${tiles[0]?.id ?? index}`, tiles });
    }
  }
  return rows;
}
