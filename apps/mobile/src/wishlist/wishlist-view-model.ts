import type { WishlistEntry } from "@kit/api-contract";

export type WishlistThumb = {
  jerseyId: string;
  thumbUrl: string | null;
  handle: string;
  route: string;
  accessibilityLabel: string;
};

export type WishlistRowBadge =
  | { kind: "new"; label: string }
  | { kind: "count"; label: string }
  | { kind: "none" };

export type WishlistRow = {
  id: string;
  title: string;
  facetLine: string;
  badge: WishlistRowBadge;
  emptyLabel: string | null;
  thumbs: WishlistThumb[];
  accessibilityLabel: string;
};

export type WishlistViewModel = { page: "empty" | "list"; rows: WishlistRow[] };

const OPEN_SEASON_LABEL = "Alle sæsoner";
const OPEN_SIZE_LABEL = "Alle størrelser";
const NO_MATCHES_LABEL = "Ingen endnu";

function newMatchesPhrase(count: number): string {
  return count === 1 ? "1 ny match" : `${count} nye matches`;
}

function buildRow(entry: WishlistEntry): WishlistRow {
  const side = entry.clubLabel ?? entry.nationalTeamLabel;
  const season = entry.seasonLabel ?? OPEN_SEASON_LABEL;
  const title = side ? `${side} · ${season}` : season;
  const facetLine = [entry.typeLabel, entry.sizeLabel ?? OPEN_SIZE_LABEL]
    .filter((part) => part !== null)
    .join(" · ");

  const badge: WishlistRowBadge =
    entry.unseenCount > 0
      ? { kind: "new", label: `${entry.unseenCount} nye` }
      : entry.matchCount > 0
        ? { kind: "count", label: String(entry.matchCount) }
        : { kind: "none" };

  return {
    id: entry.id,
    title,
    facetLine,
    badge,
    emptyLabel: entry.matchCount === 0 ? NO_MATCHES_LABEL : null,
    thumbs: entry.matches.map((match) => ({
      jerseyId: match.jerseyId,
      thumbUrl: match.thumbUrl,
      handle: match.ownerHandle,
      route: `/search/${match.jerseyId}`,
      accessibilityLabel: `${title}, ${facetLine}, fra @${match.ownerHandle}`,
    })),
    accessibilityLabel: `${title}, ${facetLine}, ${newMatchesPhrase(entry.unseenCount)}`,
  };
}

export function buildWishlistViewModel(entries: WishlistEntry[]): WishlistViewModel {
  return {
    page: entries.length === 0 ? "empty" : "list",
    rows: entries.map(buildRow),
  };
}
