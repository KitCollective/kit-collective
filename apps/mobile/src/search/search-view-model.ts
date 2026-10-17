import type {
  CollectionDiscoverHome,
  CollectionDiscoverJersey,
  CollectionDiscoverTypeahead,
} from "@kit/api-contract";
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

export function playerDrillHref(playerId: string, playerLabel: string): string {
  return `/(tabs)/search/player/${playerId}?label=${encodeURIComponent(playerLabel)}`;
}

export function kitDrillHref(kitId: string, label: string): string {
  return `/(tabs)/search/kit/${kitId}?label=${encodeURIComponent(label)}`;
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

export type SearchHitLeading =
  | { kind: "initials"; label: string }
  | { kind: "number"; number: number }
  | { kind: "thumb"; photo: CollectionDiscoverJersey["photos"][number] }
  | { kind: "avatar"; handle: string; avatarUrl: string | null };

export type SearchHit = {
  key: string;
  name: string;
  /** Kind, then ` · n trøjer`. The kind is a caption, never a section heading. */
  caption: string;
  leading: SearchHitLeading;
  href: string;
  accessibilityLabel: string;
};

export type SearchTypeahead = {
  hits: SearchHit[];
  tiles: SearchTile[];
  jerseyCount: number;
};

/** One or two letters for the leading slot, as the Mark fallback does: first letters of two words. */
function hitInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase();
}

function jerseyCountLabel(count: number): string {
  return count === 1 ? "1 trøje" : `${count} trøjer`;
}

type RankedHit = SearchHit & { rank: number; jerseyCount: number };

function rankedHit(
  hit: Omit<SearchHit, "accessibilityLabel" | "caption"> & { kind: string; jerseyCount: number },
  rank: number,
): RankedHit {
  const { kind, ...rest } = hit;
  return {
    ...rest,
    caption: `${kind} · ${jerseyCountLabel(hit.jerseyCount)}`,
    accessibilityLabel: `${hit.name}, ${kind}`,
    rank,
  };
}

/**
 * Typeahead as one flat list (docs/design-system.md → Søg home and typeahead, Revision
 * 2026-10-10): clubs and national teams together, then players, kits, collectors; most
 * collected first inside a kind, ties on label in Danish order. Under the list sit the
 * jerseys the query matches, as the same tiles the home uses. The server sends no order.
 */
export function buildSearchTypeahead(typeahead: CollectionDiscoverTypeahead): SearchTypeahead {
  const ranked: RankedHit[] = [
    ...(typeahead.clubs ?? []).map((club) =>
      rankedHit(
        {
          key: `club-${club.clubId}`,
          name: club.clubLabel,
          kind: "Klub",
          jerseyCount: club.jerseyCount,
          leading: { kind: "initials", label: hitInitials(club.clubLabel) },
          href: clubDrillHref(club.clubId, club.clubLabel),
        },
        0,
      ),
    ),
    ...(typeahead.nationalTeams ?? []).map((team) =>
      rankedHit(
        {
          key: `national-team-${team.nationalTeamId}`,
          name: team.nationalTeamLabel,
          kind: "Landshold",
          jerseyCount: team.jerseyCount,
          leading: { kind: "initials", label: hitInitials(team.nationalTeamLabel) },
          href: nationalTeamDrillHref(team.nationalTeamId, team.nationalTeamLabel),
        },
        0,
      ),
    ),
    ...(typeahead.players ?? []).map((player) =>
      rankedHit(
        {
          key: `player-${player.playerId}`,
          name: player.playerLabel,
          kind: "Spiller",
          jerseyCount: player.jerseyCount,
          leading:
            player.number === null
              ? { kind: "initials", label: hitInitials(player.playerLabel) }
              : { kind: "number", number: player.number },
          href: playerDrillHref(player.playerId, player.playerLabel),
        },
        1,
      ),
    ),
    ...(typeahead.kits ?? []).map((kit) =>
      rankedHit(
        {
          key: `kit-${kit.kitId}`,
          name: kit.label,
          kind: "Kit",
          jerseyCount: kit.jerseyCount,
          leading: kit.photo
            ? { kind: "thumb", photo: kit.photo }
            : { kind: "initials", label: hitInitials(kit.label) },
          href: kitDrillHref(kit.kitId, kit.label),
        },
        2,
      ),
    ),
    ...(typeahead.collectors ?? []).map((collector) =>
      rankedHit(
        {
          key: `collector-${collector.handle}`,
          name: collector.handle,
          kind: "Samler",
          jerseyCount: collector.jerseyCount,
          leading: { kind: "avatar", handle: collector.handle, avatarUrl: collector.avatarUrl },
          href: peerProfileHref(collector.handle),
        },
        3,
      ),
    ),
  ];
  ranked.sort(
    (left, right) =>
      left.rank - right.rank ||
      right.jerseyCount - left.jerseyCount ||
      left.name.localeCompare(right.name, "da"),
  );

  const tiles = (typeahead.jerseys ?? []).map(buildSearchTile);
  return {
    hits: ranked.map(({ rank: _rank, jerseyCount: _jerseyCount, ...hit }) => hit),
    tiles,
    jerseyCount: tiles.length,
  };
}
