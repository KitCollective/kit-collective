import type { KitType } from "@kit/domain";
import { describe, expect, it } from "vitest";
import {
  catalogHintCompactMatches,
  classifyVisionEval,
  compactCatalogHint,
} from "../src/collection/vision-eval.js";

const CLUB_A = "33333333-3333-3333-3333-333333333333";
const CLUB_B = "55555555-5555-5555-5555-555555555555";
const SEASON = "44444444-4444-4444-4444-444444444444";
const PATCH = "66666666-6666-6666-6666-666666666666";
const PLAYER = "77777777-7777-7777-7777-777777777777";
const KIT_TYPE: KitType = "home";

describe("compactCatalogHint", () => {
  it("folds diacritics and punctuation the same way as kit-lock", () => {
    expect(compactCatalogHint("F.C. København")).toBe("fckobenhavn");
    expect(compactCatalogHint("FC Kobenhavn")).toBe("fckobenhavn");
    expect(catalogHintCompactMatches("FCK", "FCK")).toBe(true);
    expect(catalogHintCompactMatches("FCK", "F.C. København")).toBe(false);
  });
});

describe("classifyVisionEval", () => {
  it("returns transport for pending, failed, and noop even when pickers match", () => {
    for (const status of ["pending", "failed", "noop"] as const) {
      const result = classifyVisionEval({
        status,
        suggested: { clubId: CLUB_A, seasonId: SEASON, type: KIT_TYPE },
        selected: { clubId: CLUB_A, seasonId: SEASON, type: KIT_TYPE },
      });
      expect(result.evalClass).toBe("transport");
    }
  });

  it("returns model when a non-empty suggestion differs from selected", () => {
    const result = classifyVisionEval({
      status: "ready",
      suggested: { clubId: CLUB_A, seasonId: SEASON, type: KIT_TYPE },
      selected: { clubId: CLUB_B, seasonId: SEASON, type: KIT_TYPE },
      entityHints: { side: ["Rangers FC"] },
      selectedCatalogLabels: { side: ["F.C. København", "FCK"] },
    });
    expect(result.evalClass).toBe("model");
    expect(result.fieldHits.side).toBe(false);
    expect(result.fieldHits.season).toBe(true);
    expect(result.fieldHits.type).toBe(true);
  });

  it("returns model when a hallucinated patch UUID is left empty by the collector", () => {
    const result = classifyVisionEval({
      status: "ready",
      suggested: { clubId: CLUB_B, seasonId: SEASON, type: KIT_TYPE, patchId: PATCH },
      selected: { clubId: CLUB_B, seasonId: SEASON, type: KIT_TYPE },
    });
    expect(result.evalClass).toBe("model");
    expect(result.fieldHits.patch).toBe(false);
    expect(result.fieldHits.player).toBe(true);
  });

  it("returns alias when a hint compact-matches selected CatalogLabel and suggested UUID is empty", () => {
    const result = classifyVisionEval({
      status: "ready",
      suggested: {},
      selected: { clubId: CLUB_B, seasonId: SEASON, type: KIT_TYPE },
      catalogMiss: true,
      entityHints: { side: ["FCK"] },
      selectedCatalogLabels: { side: ["F.C. København", "FCK"] },
    });
    expect(result.evalClass).toBe("alias");
    expect(result.fieldHits.side).toBe(false);
  });

  it("returns coverage when kitType and season label would compact-match but clubHint does not", () => {
    const result = classifyVisionEval({
      status: "ready",
      suggested: {},
      selected: { clubId: CLUB_B, seasonId: SEASON, type: KIT_TYPE },
      catalogMiss: true,
      entityHints: { side: ["Zyx Unknown"] },
      selectedCatalogLabels: { side: ["F.C. København", "FCK"] },
    });
    expect(result.evalClass).toBe("coverage");
  });

  it("returns alias when a player hint matches selected player CatalogLabel and suggested player is empty", () => {
    const result = classifyVisionEval({
      status: "ready",
      suggested: { clubId: CLUB_B },
      selected: { clubId: CLUB_B, seasonId: SEASON, type: KIT_TYPE, playerId: PLAYER },
      entityHints: { player: ["Jonas Wind"] },
      selectedCatalogLabels: {
        side: ["F.C. København", "FCK"],
        player: ["Jonas Wind"],
      },
    });
    expect(result.evalClass).toBe("alias");
    expect(result.fieldHits.side).toBe(true);
    expect(result.fieldHits.player).toBe(false);
  });

  it("does not alias when a player hint matches and suggested player UUID already equals selected", () => {
    const result = classifyVisionEval({
      status: "ready",
      suggested: { clubId: CLUB_B, seasonId: SEASON, type: KIT_TYPE, playerId: PLAYER },
      selected: { clubId: CLUB_B, seasonId: SEASON, type: KIT_TYPE, playerId: PLAYER },
      entityHints: { player: ["Jonas Wind"] },
      selectedCatalogLabels: { player: ["Jonas Wind"] },
    });
    expect(result.evalClass).toBe("accepted");
    expect(result.fieldHits.player).toBe(true);
  });

  it("returns coverage when a required field is selected, suggestion is empty, and catalogMiss", () => {
    const result = classifyVisionEval({
      status: "ready",
      suggested: {},
      selected: { clubId: CLUB_B, seasonId: SEASON, type: KIT_TYPE },
      catalogMiss: true,
      entityHints: { side: ["Zyx Unknown"] },
      selectedCatalogLabels: { side: ["F.C. København", "FCK"] },
    });
    expect(result.evalClass).toBe("coverage");
  });

  it("returns coverage on zero kit hits when catalogMiss is false", () => {
    const result = classifyVisionEval({
      status: "ready",
      suggested: { clubId: CLUB_B },
      selected: { clubId: CLUB_B, seasonId: SEASON, type: KIT_TYPE, catalogKitId: PATCH },
      zeroKitHits: true,
      selectedCatalogLabels: { side: ["F.C. København"] },
    });
    expect(result.evalClass).toBe("coverage");
    expect(result.fieldHits.catalogKitId).toBe(false);
  });

  it("returns coverage when ready suggestions omit season and type even without catalogMiss", () => {
    const result = classifyVisionEval({
      status: "ready",
      suggested: { clubId: CLUB_B },
      selected: { clubId: CLUB_B, seasonId: SEASON, type: KIT_TYPE },
    });
    expect(result.evalClass).toBe("coverage");
    expect(result.fieldHits.side).toBe(true);
    expect(result.fieldHits.season).toBe(false);
    expect(result.fieldHits.type).toBe(false);
  });

  it("returns accepted when ready suggestions match identity fields", () => {
    const result = classifyVisionEval({
      status: "ready",
      suggested: { clubId: CLUB_B, seasonId: SEASON, type: KIT_TYPE },
      selected: { clubId: CLUB_B, seasonId: SEASON, type: KIT_TYPE },
    });
    expect(result.evalClass).toBe("accepted");
    expect(result.fieldHits).toEqual({
      side: true,
      season: true,
      type: true,
      catalogKitId: true,
      player: true,
      patch: true,
    });
  });

  it("treats empty optional player and patch as hits", () => {
    const result = classifyVisionEval({
      status: "ready",
      suggested: { clubId: CLUB_B, seasonId: SEASON, type: KIT_TYPE },
      selected: { clubId: CLUB_B, seasonId: SEASON, type: KIT_TYPE },
    });
    expect(result.fieldHits.player).toBe(true);
    expect(result.fieldHits.patch).toBe(true);
  });
});
