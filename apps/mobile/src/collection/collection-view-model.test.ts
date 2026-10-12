import type { CollectionJersey } from "@kit/api-contract";
import { describe, expect, it } from "vitest";
import {
  buildCollectionView,
  COLLECTION_SORT_LABELS_DA,
  COLLECTION_SORTS,
  COLLECTION_VIEW_LABELS_DA,
  COLLECTION_VIEWS,
  seasonStartYear,
  toListRows,
} from "@/collection/collection-view-model";

let counter = 0;

function jersey(overrides: Partial<CollectionJersey> = {}): CollectionJersey {
  counter += 1;
  const id = `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
  return {
    id,
    clubId: "club-a",
    nationalTeamId: null,
    seasonId: "season-1",
    countryId: "country-1",
    leagueId: null,
    catalogKitId: null,
    type: "home",
    size: "m",
    condition: "used",
    countryLabel: "Danmark",
    leagueLabel: null,
    clubLabel: "Brøndby IF",
    nationalTeamLabel: null,
    seasonLabel: "2023/24",
    squadPlayers: [],
    photos: [],
    biddingEnabled: false,
    private: false,
    ...overrides,
  };
}

const FCK = { clubId: "club-f", clubLabel: "F.C. København" };
const AGF = { clubId: "club-g", clubLabel: "AGF" };
const AAB = { clubId: "club-aa", clubLabel: "Aalborg BK" };
const DENMARK = {
  clubId: null,
  clubLabel: null,
  nationalTeamId: "nt-dk",
  nationalTeamLabel: "Danmark",
};

function build(
  all: CollectionJersey[],
  options: {
    narrowed?: CollectionJersey[];
    view?: "all" | "open" | "bids" | "private";
    sort?: "latest" | "club" | "seasonNewest" | "seasonOldest";
  } = {},
) {
  return buildCollectionView({
    allJerseys: all,
    jerseys: options.narrowed ?? all,
    view: options.view ?? "all",
    sort: options.sort ?? "latest",
  });
}

function ids(view: ReturnType<typeof build>): string[] {
  return view.groups.flatMap((group) => group.tiles.map((tile) => tile.id));
}

describe("facts", () => {
  it("is null while the collection is empty", () => {
    expect(build([]).facts).toBeNull();
  });

  it("counts jerseys, distinct clubs plus national teams, and the oldest start year", () => {
    const all = [
      jersey({ ...FCK, seasonLabel: "2023/24" }),
      jersey({ ...FCK, seasonLabel: "1998/99" }),
      jersey({ ...AGF, seasonLabel: "2010" }),
      jersey({ ...DENMARK, seasonLabel: "1992" }),
    ];
    expect(build(all).facts).toEqual({ jerseyCount: 4, clubCount: 3, oldestSeasonYear: 1992 });
  });

  it("reads the whole collection, not the shortcut or the view", () => {
    const first = jersey({ ...FCK });
    const all = [first, jersey({ ...AGF, private: true, seasonLabel: "1990/91" })];
    const view = build(all, { narrowed: [first], view: "private" });
    expect(view.facts).toEqual({ jerseyCount: 2, clubCount: 2, oldestSeasonYear: 1990 });
  });

  it("skips a season label without a start year", () => {
    const all = [jersey({ seasonLabel: "Retro" }), jersey({ seasonLabel: "2005/06" })];
    expect(build(all).facts?.oldestSeasonYear).toBe(2005);
    expect(build([jersey({ seasonLabel: "Retro" })]).facts?.oldestSeasonYear).toBeNull();
  });

  it("shows with one jersey", () => {
    expect(build([jersey()]).facts?.jerseyCount).toBe(1);
  });
});

describe("seasonStartYear", () => {
  it("is the leading four digits", () => {
    expect(seasonStartYear("2023/24")).toBe(2023);
    expect(seasonStartYear("2010")).toBe(2010);
    expect(seasonStartYear("Retro")).toBeNull();
    expect(seasonStartYear("23/24")).toBeNull();
  });
});

describe("views", () => {
  const plain = jersey({ ...FCK });
  const open = jersey({ ...FCK, biddingEnabled: true });
  const withBids = jersey({ ...AGF, biddingEnabled: true, unansweredBidCount: 2 });
  const priv = jersey({ ...AGF, private: true });
  const all = [plain, open, withBids, priv];

  it("lists the four views and their Danish names", () => {
    expect(COLLECTION_VIEWS).toEqual(["all", "open", "bids", "private"]);
    expect(COLLECTION_VIEW_LABELS_DA).toEqual({
      all: "Alle",
      open: "Åbne for bud",
      bids: "Med bud",
      private: "Private",
    });
  });

  it("counts every view over the list", () => {
    expect(build(all).viewCounts).toEqual({ all: 4, open: 2, bids: 1, private: 1 });
  });

  it("filters by each view", () => {
    expect(ids(build(all, { view: "all" }))).toEqual([plain.id, open.id, withBids.id, priv.id]);
    expect(ids(build(all, { view: "open" }))).toEqual([open.id, withBids.id]);
    expect(ids(build(all, { view: "bids" }))).toEqual([withBids.id]);
    expect(ids(build(all, { view: "private" }))).toEqual([priv.id]);
  });

  it("treats a missing bid count as zero", () => {
    const view = build(
      [jersey({ unansweredBidCount: undefined }), jersey({ unansweredBidCount: 0 })],
      { view: "bids" },
    );
    expect(view.viewCounts.bids).toBe(0);
    expect(ids(view)).toEqual([]);
  });

  it("filters the shortcut result: the shortcut narrows first, the view filters that", () => {
    const narrowed = [open, withBids];
    const view = build(all, { narrowed, view: "private" });
    expect(view.viewCounts).toEqual({ all: 2, open: 2, bids: 1, private: 0 });
    expect(ids(view)).toEqual([]);
    expect(ids(build(all, { narrowed, view: "open" }))).toEqual([open.id, withBids.id]);
  });
});

describe("sorts", () => {
  const a = jersey({ ...FCK, seasonLabel: "2015/16" });
  const b = jersey({ ...AGF, seasonLabel: "2023/24" });
  const c = jersey({ ...AAB, seasonLabel: "1998/99" });
  const d = jersey({ ...FCK, seasonLabel: "2023/24" });
  const all = [a, b, c, d];

  it("lists the four sorts and their Danish names", () => {
    expect(COLLECTION_SORTS).toEqual(["latest", "club", "seasonNewest", "seasonOldest"]);
    expect(COLLECTION_SORT_LABELS_DA).toEqual({
      latest: "Senest tilføjet",
      club: "Klub A–Å",
      seasonNewest: "Sæson nyeste først",
      seasonOldest: "Sæson ældste først",
    });
  });

  it("latest added keeps the API order", () => {
    expect(ids(build(all, { sort: "latest" }))).toEqual([a.id, b.id, c.id, d.id]);
  });

  it("club A–Å orders groups with Danish collation (Aa counts as Å) and keeps API order inside a club", () => {
    const view = build(all, { sort: "club" });
    expect(view.groups.map((group) => group.label)).toEqual([
      "AGF",
      "F.C. København",
      "Aalborg BK",
    ]);
    expect(ids(view)).toEqual([b.id, a.id, d.id, c.id]);
  });

  it("sorts Danish letters after Z in club order", () => {
    const ae = jersey({ clubId: "club-ae", clubLabel: "Ærø IF" });
    const z = jersey({ clubId: "club-z", clubLabel: "Zulte" });
    const view = build([ae, z], { sort: "club" });
    expect(view.groups.map((group) => group.label)).toEqual(["Zulte", "Ærø IF"]);
  });

  it("season newest first by start year, stable on ties", () => {
    expect(ids(build(all, { sort: "seasonNewest" }))).toEqual([b.id, d.id, a.id, c.id]);
  });

  it("season oldest first by start year, stable on ties", () => {
    expect(ids(build(all, { sort: "seasonOldest" }))).toEqual([c.id, a.id, b.id, d.id]);
  });

  it("puts a label without a start year last in both season sorts", () => {
    const odd = jersey({ seasonLabel: "Retro" });
    const list = [odd, a, c];
    expect(ids(build(list, { sort: "seasonNewest" }))).toEqual([a.id, c.id, odd.id]);
    expect(ids(build(list, { sort: "seasonOldest" }))).toEqual([c.id, a.id, odd.id]);
  });
});

describe("groups and captions", () => {
  const fck = jersey({
    ...FCK,
    seasonLabel: "2023/24",
    size: "l",
    type: "away",
    playerLabel: "Zeca",
  });
  const fckPlain = jersey({ ...FCK, seasonLabel: "2015/16", size: "xl", type: "home" });
  const dk = jersey({ ...DENMARK, seasonLabel: "1992", size: "m", type: "home" });
  const all = [fck, fckPlain, dk];

  it("has one group without a heading outside club sort", () => {
    for (const sort of ["latest", "seasonNewest", "seasonOldest"] as const) {
      const view = build(all, { sort });
      expect(view.groups).toHaveLength(1);
      expect(view.groups[0]?.label).toBeNull();
      expect(view.groups[0]?.count).toBe(3);
    }
  });

  it("groups by club and national team with a label and count in club sort", () => {
    const view = build(all, { sort: "club" });
    expect(view.groups.map((group) => [group.label, group.count])).toEqual([
      ["Danmark", 1],
      ["F.C. København", 2],
    ]);
  });

  it("has no groups for an empty result", () => {
    expect(build(all, { view: "private" }).groups).toEqual([]);
  });

  it("leads with the club and trails the size outside club sort", () => {
    const tile = build(all, { sort: "latest" }).groups[0]?.tiles[0];
    expect(tile?.primaryLead).toBe("F.C. København");
    expect(tile?.primaryTrailing).toBe("L");
    expect(tile?.secondaryLine).toBe("2023/24 · Ude");
  });

  it("uses the national team as the lead when there is no club", () => {
    const tile = build([dk]).groups[0]?.tiles[0];
    expect(tile?.primaryLead).toBe("Danmark");
  });

  it("leads with the season and trails the size in club sort, then type · player", () => {
    const [first, second] = build(all, { sort: "club" }).groups[1]?.tiles ?? [];
    expect(first?.primaryLead).toBe("2023/24");
    expect(first?.primaryTrailing).toBe("L");
    expect(first?.secondaryLine).toBe("Ude · Zeca");
    expect(second?.secondaryLine).toBe("Hjemme");
  });
});

describe("badge", () => {
  it("shows the unanswered bid count", () => {
    const tile = build([jersey({ unansweredBidCount: 3 })]).groups[0]?.tiles[0];
    expect(tile?.badge).toEqual({ kind: "bids", count: 3 });
  });

  it("shows a lock for a private jersey", () => {
    expect(build([jersey({ private: true })]).groups[0]?.tiles[0]?.badge).toEqual({
      kind: "lock",
    });
  });

  it("lets the bids win when a private jersey has unanswered bids, never both", () => {
    const tile = build([jersey({ private: true, unansweredBidCount: 1 })]).groups[0]?.tiles[0];
    expect(tile?.badge).toEqual({ kind: "bids", count: 1 });
  });

  it("shows nothing for open bidding without bids", () => {
    const tile = build([jersey({ biddingEnabled: true, unansweredBidCount: 0 })]).groups[0]
      ?.tiles[0];
    expect(tile?.badge).toBeNull();
  });
});

describe("toListRows", () => {
  it("puts tiles two to a row with no headings outside club sort", () => {
    const list = [jersey(), jersey(), jersey()];
    const rows = toListRows(build(list).groups);
    expect(rows.map((row) => row.kind)).toEqual(["row", "row"]);
    expect(rows[0]?.kind === "row" && rows[0].tiles).toHaveLength(2);
    expect(rows[1]?.kind === "row" && rows[1].tiles).toHaveLength(1);
  });

  it("starts a new row under every heading in club sort", () => {
    const list = [jersey({ ...FCK }), jersey({ ...AGF }), jersey({ ...FCK })];
    const rows = toListRows(build(list, { sort: "club" }).groups);
    expect(rows.map((row) => row.kind)).toEqual(["heading", "row", "heading", "row"]);
    expect(rows[0]).toMatchObject({ kind: "heading", label: "AGF", count: 1 });
    expect(rows[2]).toMatchObject({ kind: "heading", label: "F.C. København", count: 2 });
  });

  it("gives every row a unique key", () => {
    const list = [jersey({ ...FCK }), jersey({ ...AGF }), jersey({ ...FCK }), jersey({ ...AGF })];
    const keys = toListRows(build(list, { sort: "club" }).groups).map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
