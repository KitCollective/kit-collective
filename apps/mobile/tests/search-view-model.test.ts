import type {
  CollectionDiscoverHome,
  CollectionDiscoverJersey,
  CollectionDiscoverTypeahead,
} from "@kit/api-contract";
import { describe, expect, it } from "vitest";
import {
  buildSearchHome,
  buildSearchTypeahead,
  kitDrillHref,
  playerDrillHref,
  type SearchShelf,
  searchJerseyTileCaption,
} from "../src/search/search-view-model";

const CLUB_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CLUB_ID = "22222222-2222-4222-8222-222222222222";
const TEAM_ID = "33333333-3333-4333-8333-333333333333";
const JERSEY_ID = "44444444-4444-4444-8444-444444444444";

function discoverJersey(overrides: Partial<CollectionDiscoverJersey> = {}) {
  // SAFETY: the fixture sets every required field of the discover jersey; photos are trimmed to what the view-model reads.
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
  // SAFETY: `find` matched on `kind`, so the shelf is the member of the union with that kind.
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

const PLAYER_ID = "77777777-7777-4777-8777-777777777777";
const OTHER_PLAYER_ID = "88888888-8888-4888-8888-888888888888";
const KIT_ID = "99999999-9999-4999-8999-999999999999";
const OTHER_KIT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const kitPhoto = {
  id: "kp1",
  source: "camera",
  role: "front",
  objectKey: "photos/kp1.jpg",
  photoUrl: "/photos/kp1.jpg",
  ocrStatus: "none",
} as const;

/** One hit of every kind, deliberately out of the order the screen shows them in. */
function scrambledTypeahead(): CollectionDiscoverTypeahead {
  return {
    collectors: [{ handle: "mads", initial: "M", avatarUrl: "/avatars/mads", jerseyCount: 4 }],
    kits: [
      { kitId: KIT_ID, label: "FC København 2023/24 Hjemme", jerseyCount: 1, photo: kitPhoto },
      { kitId: OTHER_KIT_ID, label: "Brøndby IF 2022/23 Ude", jerseyCount: 3, photo: null },
    ],
    players: [
      { playerId: PLAYER_ID, playerLabel: "Kasper Schmeichel", jerseyCount: 2, number: 1 },
      { playerId: OTHER_PLAYER_ID, playerLabel: "Pione Sisto", jerseyCount: 5, number: null },
    ],
    nationalTeams: [{ nationalTeamId: TEAM_ID, nationalTeamLabel: "Danmark", jerseyCount: 5 }],
    clubs: [
      { clubId: CLUB_ID, clubLabel: "FC København", jerseyCount: 2 },
      { clubId: OTHER_CLUB_ID, clubLabel: "Brøndby IF", jerseyCount: 7 },
    ],
    jerseys: [discoverJersey({ size: "xl" })],
  };
}

function hitOf(typeahead: CollectionDiscoverTypeahead, key: string) {
  const hit = buildSearchTypeahead(typeahead).hits.find((candidate) => candidate.key === key);
  expect(hit, `expected a hit ${key}`).toBeTruthy();
  // SAFETY: the expect above fails the test when no hit matched.
  return hit as ReturnType<typeof buildSearchTypeahead>["hits"][number];
}

describe("buildSearchTypeahead", () => {
  it("orders clubs and national teams together, then players, kits, collectors", () => {
    const { hits } = buildSearchTypeahead(scrambledTypeahead());

    expect(hits.map((hit) => hit.key)).toEqual([
      `club-${OTHER_CLUB_ID}`,
      `national-team-${TEAM_ID}`,
      `club-${CLUB_ID}`,
      `player-${OTHER_PLAYER_ID}`,
      `player-${PLAYER_ID}`,
      `kit-${OTHER_KIT_ID}`,
      `kit-${KIT_ID}`,
      "collector-mads",
    ]);
  });

  it("puts the most collected first inside a kind and breaks ties on label in Danish order", () => {
    const { hits } = buildSearchTypeahead({
      clubs: [
        { clubId: CLUB_ID, clubLabel: "Åbyhøj IF", jerseyCount: 2 },
        { clubId: OTHER_CLUB_ID, clubLabel: "Esbjerg fB", jerseyCount: 2 },
      ],
      nationalTeams: [{ nationalTeamId: TEAM_ID, nationalTeamLabel: "Brasilien", jerseyCount: 2 }],
    });

    // 'da' collation puts Å after Z.
    expect(hits.map((hit) => hit.name)).toEqual(["Brasilien", "Esbjerg fB", "Åbyhøj IF"]);
  });

  it("captions every hit with its kind and the jersey count", () => {
    const typeahead = scrambledTypeahead();

    expect(hitOf(typeahead, `club-${CLUB_ID}`).caption).toBe("Klub · 2 trøjer");
    expect(hitOf(typeahead, `national-team-${TEAM_ID}`).caption).toBe("Landshold · 5 trøjer");
    expect(hitOf(typeahead, `player-${PLAYER_ID}`).caption).toBe("Spiller · 2 trøjer");
    expect(hitOf(typeahead, `kit-${OTHER_KIT_ID}`).caption).toBe("Kit · 3 trøjer");
    expect(hitOf(typeahead, "collector-mads").caption).toBe("Samler · 4 trøjer");
  });

  it("reads one copy as 1 trøje", () => {
    expect(hitOf(scrambledTypeahead(), `kit-${KIT_ID}`).caption).toBe("Kit · 1 trøje");
  });

  it("names a hit for the screen reader as name, then kind", () => {
    const typeahead = scrambledTypeahead();

    expect(hitOf(typeahead, `club-${CLUB_ID}`).accessibilityLabel).toBe("FC København, Klub");
    expect(hitOf(typeahead, `national-team-${TEAM_ID}`).accessibilityLabel).toBe(
      "Danmark, Landshold",
    );
    expect(hitOf(typeahead, `player-${PLAYER_ID}`).accessibilityLabel).toBe(
      "Kasper Schmeichel, Spiller",
    );
    expect(hitOf(typeahead, `kit-${KIT_ID}`).accessibilityLabel).toBe(
      "FC København 2023/24 Hjemme, Kit",
    );
    expect(hitOf(typeahead, "collector-mads").accessibilityLabel).toBe("mads, Samler");
  });

  it("leads a club or a national team with initials, a player with a number, a kit with a thumb, a collector with an avatar", () => {
    const typeahead = scrambledTypeahead();

    expect(hitOf(typeahead, `club-${CLUB_ID}`).leading).toEqual({
      kind: "initials",
      label: "FK",
    });
    expect(hitOf(typeahead, `national-team-${TEAM_ID}`).leading).toEqual({
      kind: "initials",
      label: "DA",
    });
    expect(hitOf(typeahead, `player-${PLAYER_ID}`).leading).toEqual({ kind: "number", number: 1 });
    expect(hitOf(typeahead, `kit-${KIT_ID}`).leading).toEqual({ kind: "thumb", photo: kitPhoto });
    expect(hitOf(typeahead, "collector-mads").leading).toEqual({
      kind: "avatar",
      handle: "mads",
      avatarUrl: "/avatars/mads",
    });
  });

  it("falls back to initials for a player without a number and a kit without a photo", () => {
    const typeahead = scrambledTypeahead();

    expect(hitOf(typeahead, `player-${OTHER_PLAYER_ID}`).leading).toEqual({
      kind: "initials",
      label: "PS",
    });
    expect(hitOf(typeahead, `kit-${OTHER_KIT_ID}`).leading).toEqual({
      kind: "initials",
      label: "BI",
    });
  });

  it("opens each hit on its drill: club, national team, player, kit, Peer Profil", () => {
    const typeahead = scrambledTypeahead();
    const label = (value: string) => encodeURIComponent(value);

    expect(hitOf(typeahead, `club-${CLUB_ID}`).href).toBe(
      `/(tabs)/search/club/${CLUB_ID}?label=${label("FC København")}`,
    );
    expect(hitOf(typeahead, `national-team-${TEAM_ID}`).href).toBe(
      `/(tabs)/search/national-team/${TEAM_ID}?label=${label("Danmark")}`,
    );
    expect(hitOf(typeahead, `player-${PLAYER_ID}`).href).toBe(
      `/(tabs)/search/player/${PLAYER_ID}?label=${label("Kasper Schmeichel")}`,
    );
    expect(hitOf(typeahead, `kit-${KIT_ID}`).href).toBe(
      `/(tabs)/search/kit/${KIT_ID}?label=${label("FC København 2023/24 Hjemme")}`,
    );
    expect(hitOf(typeahead, "collector-mads").href).toBe("/(tabs)/search/peer/mads");
  });

  it("exposes the player and kit drill hrefs next to the club and national team ones", () => {
    expect(playerDrillHref(PLAYER_ID, "Pione Sisto")).toBe(
      `/(tabs)/search/player/${PLAYER_ID}?label=Pione%20Sisto`,
    );
    expect(kitDrillHref(KIT_ID, "OB 2023/24 Ude")).toBe(
      `/(tabs)/search/kit/${KIT_ID}?label=OB%202023%2F24%20Ude`,
    );
  });

  it("builds the Trøjer grid from the jerseys with the owner's size, and counts them", () => {
    const { tiles, jerseyCount } = buildSearchTypeahead(scrambledTypeahead());

    expect(jerseyCount).toBe(1);
    expect(tiles).toHaveLength(1);
    expect(tiles[0]?.caption).toEqual({
      lead: "FC København",
      leadRole: "club",
      trailing: "XL",
      secondary: "2023/24 · Hjemme",
    });
    expect(tiles[0]?.href).toBe(`/(tabs)/search/${JERSEY_ID}`);
  });

  it("returns nothing for an empty typeahead, so the screen shows Ingen resultater", () => {
    expect(buildSearchTypeahead({})).toEqual({ hits: [], tiles: [], jerseyCount: 0 });
  });

  it("keeps the Trøjer grid when there are jerseys but no hit", () => {
    const result = buildSearchTypeahead({ jerseys: [discoverJersey()] });

    expect(result.hits).toEqual([]);
    expect(result.tiles).toHaveLength(1);
  });
});
