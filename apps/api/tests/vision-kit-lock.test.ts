import { describe, expect, it } from "vitest";
import type { ObservableKitHit } from "../src/vision/vision-kit-lock.js";
import {
  catalogClubIdForSave,
  catalogHintSearchNeedles,
  collectClubHints,
  compactCatalogHint,
  isLikelyNationalTeamHint,
  pickBestCatalogSide,
  pickLockedKit,
  pickRefinedKit,
  pickUniqueKitByObservables,
  resolveObservableKitLock,
  scoreColorMatch,
  scoreLabelMatch,
} from "../src/vision/vision-kit-lock.js";

const rangersHome: ObservableKitHit = {
  kitId: "11111111-1111-4111-8111-111111111111",
  clubId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  seasonId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  seasonLabel: "2019/20",
  type: "home",
  manufacturer: "Hummel",
  sponsor: "32Red",
};

const rangersAway: ObservableKitHit = {
  kitId: "22222222-2222-4222-8222-222222222222",
  clubId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  seasonId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  seasonLabel: "2020/21",
  type: "away",
  manufacturer: "Hummel",
  sponsor: "32Red",
};

const celtic: ObservableKitHit = {
  kitId: "33333333-3333-4333-8333-333333333333",
  clubId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  seasonId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  seasonLabel: "2019/20",
  type: "home",
  manufacturer: "Hummel",
  sponsor: "32Red",
};

describe("vision kit lock", () => {
  it("locks a unique manufacturer+sponsor kit", () => {
    expect(resolveObservableKitLock([rangersHome])).toEqual({
      status: "unique",
      kit: rangersHome,
    });
  });

  it("dedupes the same kit id from multiple manufacturer labels", () => {
    expect(
      resolveObservableKitLock([rangersHome, { ...rangersHome, manufacturer: "hummel" }]),
    ).toEqual({
      status: "unique",
      kit: rangersHome,
    });
  });

  it("is ambiguous when two kits share manufacturer and sponsor", () => {
    expect(resolveObservableKitLock([rangersHome, rangersAway])).toEqual({
      status: "ambiguous",
      kits: [rangersHome, rangersAway],
    });
  });

  it("locks the club-scoped kit when global hits span two clubs", () => {
    expect(
      resolveObservableKitLock([rangersHome, celtic], rangersHome.clubId ?? undefined),
    ).toEqual({ status: "unique", kit: rangersHome });
  });

  it("locks the national-team-scoped kit when hits span a club and a side", () => {
    const denmarkHome: ObservableKitHit = {
      kitId: "44444444-4444-4444-8444-444444444444",
      clubId: null,
      nationalTeamId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeea",
      seasonId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      seasonLabel: "2010",
      type: "home",
      manufacturer: "Adidas",
      sponsor: "",
    };
    expect(
      resolveObservableKitLock([rangersHome, denmarkHome], denmarkHome.nationalTeamId ?? undefined),
    ).toEqual({ status: "unique", kit: denmarkHome });
  });

  it("picks the refined candidate by season and type", () => {
    expect(
      pickRefinedKit(
        [rangersHome, rangersAway],
        [rangersHome.kitId, rangersAway.kitId],
        "2019/20",
        "home",
      ),
    ).toEqual(rangersHome);
  });

  it("refuses to pick when refinement still matches both kits", () => {
    expect(
      pickRefinedKit(
        [rangersHome, rangersAway],
        [rangersHome.kitId, rangersAway.kitId],
        "20",
        undefined,
      ),
    ).toBeNull();
  });

  it("scores exact season labels above contains", () => {
    expect(scoreLabelMatch("2019/20", "2019/20")).toBe(95);
    expect(scoreLabelMatch("2019/20", "2020/21")).toBe(0);
  });

  it("locks compact sponsor and manufacturer spellings", () => {
    expect(scoreLabelMatch("32Red", "32 Red")).toBe(95);
    expect(scoreLabelMatch("32 Red", "32Red")).toBe(95);
    expect(scoreLabelMatch("RB Leipzig", "R.B. Leipzig")).toBe(95);
    expect(scoreLabelMatch("2019/20", "2019-20")).toBe(95);
  });

  it("treats club suffixes as the same club", () => {
    expect(scoreLabelMatch("Rangers FC", "Rangers")).toBe(85);
    expect(scoreLabelMatch("F.C. København", "FC København")).toBe(95);
  });

  it("folds Danish ø so ASCII hints compact to the official label", () => {
    expect(compactCatalogHint("F.C. København")).toBe("fckobenhavn");
    expect(compactCatalogHint("FC Kobenhavn")).toBe("fckobenhavn");
    expect(scoreLabelMatch("F.C. København", "FC Kobenhavn")).toBe(95);
    expect(catalogHintSearchNeedles("FC Kobenhavn")).toEqual(
      expect.arrayContaining(["fckobenhavn", "kobenhavn"]),
    );
  });

  it("does not treat a short year fragment as a compact season lock", () => {
    expect(scoreLabelMatch("2019/20", "20")).toBe(85);
    expect(scoreLabelMatch("2019/20", "20192021")).toBe(0);
  });

  it("builds ILIKE needles that include compact sponsor spellings", () => {
    expect(catalogHintSearchNeedles("32 Red")).toEqual(expect.arrayContaining(["32 Red", "32red"]));
    expect(catalogHintSearchNeedles("Rangers FC")).toContain("Rangers FC");
  });

  it("locks the unique type among ambiguous manufacturer+sponsor kits", () => {
    expect(
      pickUniqueKitByObservables([rangersHome, rangersAway], "home", "white with red trim"),
    ).toEqual(rangersHome);
  });

  it("locks by colour when two kits share type", () => {
    const whiteHome = { ...rangersHome, colorNames: "white, red" };
    const navyHome = {
      ...rangersAway,
      type: "home" as const,
      colorNames: "navy",
    };
    expect(
      pickUniqueKitByObservables([whiteHome, navyHome], "home", "white with red trim"),
    ).toEqual(whiteHome);
    expect(scoreColorMatch("navy", "white with red trim")).toBe(0);
  });

  it("picks a locked kit from first look or a refined second look", () => {
    expect(
      pickLockedKit([rangersHome, rangersAway], {
        kitType: "home",
        colorHint: "white with red trim",
      }),
    ).toEqual(rangersHome);
    expect(
      pickLockedKit([rangersHome, rangersAway], {
        amongKitIds: [rangersHome.kitId, rangersAway.kitId],
        seasonHint: "2019/20",
        kitType: "home",
      }),
    ).toEqual(rangersHome);
  });

  it("detects likely national-team hints for country names", () => {
    expect(isLikelyNationalTeamHint(["Argentina"])).toBe(true);
    expect(isLikelyNationalTeamHint(["Italy"])).toBe(true);
    expect(isLikelyNationalTeamHint(["Rangers FC"])).toBe(false);
    expect(isLikelyNationalTeamHint(["FC Copenhagen"])).toBe(false);
  });

  it("collects clubHint and alts without empty strings", () => {
    expect(
      collectClubHints({
        clubHint: " FC Copenhagen ",
        clubHintAlts: ["FCK", "", "FC København"],
      }),
    ).toEqual(["FC Copenhagen", "FCK", "FC København"]);
  });

  it("ranks an official NationalTeam label above a club alias of the same text", () => {
    expect(
      pickBestCatalogSide(
        [
          { entityId: "club-1", entityType: "club", text: "Danmark", kind: "alias" },
          { entityId: "nt-1", entityType: "national_team", text: "Danmark", kind: "label" },
        ],
        ["Danmark"],
        new Set(["club-1"]),
        new Set(["nt-1"]),
      ),
    ).toEqual({ id: "nt-1", kind: "national_team", score: 95 });
  });

  it("prefers NationalTeam when official labels tie on a country hint", () => {
    expect(
      pickBestCatalogSide(
        [
          { entityId: "nt-1", entityType: "national_team", text: "Denmark", kind: "label" },
          { entityId: "club-1", entityType: "club", text: "Denmark", kind: "label" },
        ],
        ["Denmark"],
        new Set(["club-1"]),
        new Set(["nt-1"]),
      ),
    ).toEqual({ id: "nt-1", kind: "national_team", score: 95 });
  });

  it("omits a Club/NationalTeam side when official labels tie on a non-country hint", () => {
    expect(
      pickBestCatalogSide(
        [
          { entityId: "nt-1", entityType: "national_team", text: "Rangers FC", kind: "label" },
          { entityId: "club-1", entityType: "club", text: "Rangers FC", kind: "label" },
        ],
        ["Rangers FC"],
        new Set(["club-1"]),
        new Set(["nt-1"]),
      ),
    ).toBeNull();
  });

  it("does not put a Club UUID on Save when the locked kit is a NationalTeam", () => {
    const denmarkHome: ObservableKitHit = {
      kitId: "44444444-4444-4444-8444-444444444444",
      clubId: null,
      nationalTeamId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeea",
      seasonId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      seasonLabel: "2010",
      type: "home",
      manufacturer: "Adidas",
      sponsor: "",
    };
    expect(
      catalogClubIdForSave(denmarkHome, { id: "club-1", kind: "club", score: 90 }),
    ).toBeUndefined();
    expect(catalogClubIdForSave(null, { id: "club-1", kind: "club", score: 90 })).toBe("club-1");
    expect(catalogClubIdForSave(rangersHome, { id: "other-club", kind: "club", score: 70 })).toBe(
      rangersHome.clubId,
    );
  });
});
