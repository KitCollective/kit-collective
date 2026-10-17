import type { CollectionDiscoverHome, CollectionDiscoverJersey } from "@kit/api-contract";
import { JERSEY_SIZE_LABELS_DA, KIT_TYPE_LABELS_DA } from "@kit/domain";
import { type JerseyTileCaption, jerseyTileMetaLine } from "@/components/jersey-tile-meta";

/**
 * Pure Søg home view-model (docs/design-system.md → Søg home and typeahead, Revision
 * 2026-10-10): the discover home in, up to three shelves out. No React Native import, so
 * it is tested without rendering.
 */

export type SearchSeeAllHref = {
  pathname: "/(tabs)/search";
  params: { shelf: "open-for-bid" };
};

export type SearchTile = {
  id: string;
  href: string;
  clubLabel: string;
  seasonLabel: string;
  typeLabel: string;
  caption: JerseyTileCaption;
  photo: CollectionDiscoverJersey["photos"][number] | null;
};

export type SearchChip = { key: string; label: string; href: string };

export type SearchCollectorRow = {
  handle: string;
  avatarUrl: string | null;
  caption: string;
  href: string;
};

export type SearchShelf =
  | { kind: "open-for-bid"; tiles: SearchTile[]; seeAllHref: SearchSeeAllHref }
  | { kind: "sides"; chips: SearchChip[] }
  | { kind: "collectors"; rows: SearchCollectorRow[] };

export const OPEN_FOR_BID_SEE_ALL_HREF: SearchSeeAllHref = {
  pathname: "/(tabs)/search",
  params: { shelf: "open-for-bid" },
};

/** Søg tile caption: club, the owner's size trailing, then season · type. No badge, no amount. */
export function searchJerseyTileCaption(jersey: CollectionDiscoverJersey): JerseyTileCaption {
  return {
    lead: jersey.clubLabel,
    leadRole: "club",
    trailing: JERSEY_SIZE_LABELS_DA[jersey.size],
    secondary: jerseyTileMetaLine(jersey.seasonLabel, KIT_TYPE_LABELS_DA[jersey.type]),
  };
}

export function buildSearchTile(jersey: CollectionDiscoverJersey): SearchTile {
  return {
    id: jersey.id,
    href: `/(tabs)/search/${jersey.id}`,
    clubLabel: jersey.clubLabel,
    seasonLabel: jersey.seasonLabel,
    typeLabel: KIT_TYPE_LABELS_DA[jersey.type],
    caption: searchJerseyTileCaption(jersey),
    photo: jersey.photos[0] ?? null,
  };
}

export function clubDrillHref(clubId: string, clubLabel: string): string {
  return `/(tabs)/search/club/${clubId}?label=${encodeURIComponent(clubLabel)}`;
}

export function nationalTeamDrillHref(nationalTeamId: string, nationalTeamLabel: string): string {
  return `/(tabs)/search/national-team/${nationalTeamId}?label=${encodeURIComponent(nationalTeamLabel)}`;
}

export function peerProfileHref(handle: string): string {
  return `/(tabs)/search/peer/${handle}`;
}

function buildSides(home: CollectionDiscoverHome): SearchChip[] {
  const sides = [
    ...(home.clubs ?? []).map((club) => ({
      key: `club-${club.clubId}`,
      label: club.clubLabel,
      href: clubDrillHref(club.clubId, club.clubLabel),
      jerseyCount: club.jerseyCount,
    })),
    ...(home.nationalTeams ?? []).map((team) => ({
      key: `national-team-${team.nationalTeamId}`,
      label: team.nationalTeamLabel,
      href: nationalTeamDrillHref(team.nationalTeamId, team.nationalTeamLabel),
      jerseyCount: team.jerseyCount,
    })),
  ];
  sides.sort(
    (left, right) =>
      right.jerseyCount - left.jerseyCount || left.label.localeCompare(right.label, "da"),
  );
  return sides.map(({ key, label, href }) => ({ key, label, href }));
}

/** The three shelves in screen order; a shelf with nothing is left out. `moreJerseys` is not shown. */
export function buildSearchHome(home: CollectionDiscoverHome): { shelves: SearchShelf[] } {
  const shelves: SearchShelf[] = [];

  const openForBid = home.openForBid ?? [];
  if (openForBid.length > 0) {
    shelves.push({
      kind: "open-for-bid",
      tiles: openForBid.map(buildSearchTile),
      seeAllHref: OPEN_FOR_BID_SEE_ALL_HREF,
    });
  }

  const chips = buildSides(home);
  if (chips.length > 0) {
    shelves.push({ kind: "sides", chips });
  }

  const collectors = home.collectors ?? [];
  if (collectors.length > 0) {
    shelves.push({
      kind: "collectors",
      rows: collectors.map((collector) => ({
        handle: collector.handle,
        avatarUrl: collector.avatarUrl,
        caption: `${collector.jerseyCount} trøjer · ${collector.openForBidCount} åbne for bud`,
        href: peerProfileHref(collector.handle),
      })),
    });
  }

  return { shelves };
}
