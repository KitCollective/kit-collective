import { describe, expect, it } from "vitest";
import type { ObservableKitHit } from "../src/vision/vision-kit-lock.js";
import {
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
});
