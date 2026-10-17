import type { CollectionDiscoverHome, CollectionDiscoverJersey } from "@kit/api-contract";
import { describe, expect, it } from "vitest";
import {
  buildSearchHome,
  type SearchShelf,
  searchJerseyTileCaption,
} from "../src/search/search-view-model";

const CLUB_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CLUB_ID = "22222222-2222-4222-8222-222222222222";
const TEAM_ID = "33333333-3333-4333-8333-333333333333";
const JERSEY_ID = "44444444-4444-4444-8444-444444444444";

function discoverJersey(overrides: Partial<CollectionDiscoverJersey> = {}) {
  return {
    id: JERSEY_ID,
    clubId: CLUB_ID,
    seasonId: "55555555-5555-4555-8555-555555555555",
    type: "home",
    clubLabel: "FC København",
    seasonLabel: "2023/24",
    ownerHandle: "mads",
    size: "m",
    photos: [{ id: "p1", photoUrl: "/photos/p1.jpg", role: "front" }],
    ...overrides,
  } as CollectionDiscoverJersey;
}

function fullHome(): CollectionDiscoverHome {
  return {
    clubs: [{ clubId: CLUB_ID, clubLabel: "FC København", jerseyCount: 2 }],
    nationalTeams: [{ nationalTeamId: TEAM_ID, nationalTeamLabel: "Danmark", jerseyCount: 5 }],
    openForBid: [discoverJersey()],
    collectors: [
      { handle: "mads", initial: "M", avatarUrl: null, jerseyCount: 3, openForBidCount: 1 },
    ],
    moreJerseys: [discoverJersey({ id: "66666666-6666-4666-8666-666666666666" })],
  };
}

function kinds(shelves: SearchShelf[]) {
  return shelves.map((shelf) => shelf.kind);
}

function shelfOf<K extends SearchShelf["kind"]>(shelves: SearchShelf[], kind: K) {
  const shelf = shelves.find((candidate) => candidate.kind === kind);
  expect(shelf, `expected a ${kind} shelf`).toBeTruthy();
  return shelf as Extract<SearchShelf, { kind: K }>;
}

describe("buildSearchHome", () => {
  it("builds exactly three shelves in order and ignores moreJerseys", () => {
    const { shelves } = buildSearchHome(fullHome());

    expect(kinds(shelves)).toEqual(["open-for-bid", "sides", "collectors"]);
  });

  it("merges clubs and national teams by copy count, most collected first", () => {
    const { shelves } = buildSearchHome(fullHome());
    const sides = shelfOf(shelves, "sides");

    expect(sides.chips.map((chip) => chip.label)).toEqual(["Danmark", "FC København"]);
  });

  it("breaks count ties on label in Danish order", () => {
    const { shelves } = buildSearchHome({
      clubs: [
        { clubId: CLUB_ID, clubLabel: "Brøndby IF", jerseyCount: 2 },
        { clubId: OTHER_CLUB_ID, clubLabel: "Esbjerg fB", jerseyCount: 2 },
      ],
      nationalTeams: [{ nationalTeamId: TEAM_ID, nationalTeamLabel: "Åland", jerseyCount: 2 }],
    });
    const sides = shelfOf(shelves, "sides");

    // 'da' collation puts Å after Z.
    expect(sides.chips.map((chip) => chip.label)).toEqual(["Brøndby IF", "Esbjerg fB", "Åland"]);
  });

  it("opens a club or a national team on the Søg catalog drill", () => {
    const { shelves } = buildSearchHome(fullHome());
    const sides = shelfOf(shelves, "sides");

    expect(sides.chips.find((chip) => chip.label === "FC København")?.href).toBe(
      `/(tabs)/search/club/${CLUB_ID}?label=${encodeURIComponent("FC København")}`,
    );
    expect(sides.chips.find((chip) => chip.label === "Danmark")?.href).toBe(
      `/(tabs)/search/national-team/${TEAM_ID}?label=${encodeURIComponent("Danmark")}`,
    );
  });

  it("gives an open-for-bid tile the size, season and type, and no badge", () => {
    const { shelves } = buildSearchHome(fullHome());
    const shelf = shelfOf(shelves, "open-for-bid");
    const tile = shelf.tiles[0];

    expect(tile?.caption).toEqual({
      lead: "FC København",
      leadRole: "club",
      trailing: "M",
      secondary: "2023/24 · Hjemme",
    });
    expect(tile).not.toHaveProperty("badge");
    expect(tile?.href).toBe(`/(tabs)/search/${JERSEY_ID}`);
    expect(tile?.clubLabel).toBe("FC København");
    expect(tile?.seasonLabel).toBe("2023/24");
  });

  it("exposes the caption builder for reuse", () => {
    expect(searchJerseyTileCaption(discoverJersey({ size: "xl", type: "away" }))).toMatchObject({
      leadRole: "club",
      trailing: "XL",
    });
  });

  it("points Se alle at the open-for-bid list on the Søg route", () => {
    const { shelves } = buildSearchHome(fullHome());

    expect(shelfOf(shelves, "open-for-bid").seeAllHref).toEqual({
      pathname: "/(tabs)/search",
      params: { shelf: "open-for-bid" },
    });
  });

  it("reads a collector row as handle, counts and Peer Profil", () => {
    const { shelves } = buildSearchHome(fullHome());
    const row = shelfOf(shelves, "collectors").rows[0];

    expect(row).toEqual({
      handle: "mads",
      avatarUrl: null,
      caption: "3 trøjer · 1 åbne for bud",
      href: "/(tabs)/search/peer/mads",
    });
  });

  it("leaves out a shelf with nothing in it", () => {
    expect(kinds(buildSearchHome({ ...fullHome(), openForBid: [] }).shelves)).toEqual([
      "sides",
      "collectors",
    ]);
    expect(kinds(buildSearchHome({ ...fullHome(), clubs: [], nationalTeams: [] }).shelves)).toEqual(
      ["open-for-bid", "collectors"],
    );
    expect(kinds(buildSearchHome({ ...fullHome(), collectors: [] }).shelves)).toEqual([
      "open-for-bid",
      "sides",
    ]);
  });

  it("returns no shelves for an empty home, so the screen shows its Empty state", () => {
    expect(buildSearchHome({}).shelves).toEqual([]);
    expect(buildSearchHome({ moreJerseys: fullHome().moreJerseys }).shelves).toEqual([]);
  });
});
