import { describe, expect, it } from "vitest";
import {
  combineModelAndMatchConfidence,
  computeOverallConfidence,
  encodeVisionEvalRaw,
  parseClubHintFromVisionRaw,
  parseConfidences,
  parseVisionEvalHints,
  parseZeroKitHits,
  resolveCatalogMissHints,
  resolveFieldGate,
  resolveIdentityJob,
  serializeConfidences,
  shouldPreselect,
} from "../dist/vision/vision-confidence.js";

describe("vision-confidence", () => {
  it("gates each field on its own confidence, not inflated match scores", () => {
    expect(computeOverallConfidence(0.3)).toBe(30);
    expect(computeOverallConfidence(undefined)).toBe(0);

    const perField = resolveIdentityJob({
      clubId: "00000000-0000-0000-0000-000000000001",
      seasonId: "00000000-0000-0000-0000-000000000002",
      confidences: { overall: 30, club: 90, season: 55 },
    });
    expect(perField.status).toBe("ready");
    expect(perField.fieldPreselect).toEqual({ club: true });
    expect(perField.suggestions?.seasonId).toBe("00000000-0000-0000-0000-000000000002");
    expect(shouldPreselect({ overall: 30 })).toBe(false);
  });

  it("preselects at ≥70% per field", () => {
    expect(resolveFieldGate(72, true)).toBe("preselect");
    expect(resolveFieldGate(69, true)).toBe("suggest");
    expect(resolveFieldGate(40, true)).toBe("omit");
    expect(resolveFieldGate(80, false)).toBe("omit");
  });

  it("preselects player independently of club at ≥70%", () => {
    const playerOnly = resolveIdentityJob({
      playerId: "00000000-0000-0000-0000-000000000004",
      playerNumber: "10",
      confidences: { overall: 80, player: 80 },
    });

    expect(playerOnly.status).toBe("ready");
    expect(playerOnly.fieldPreselect).toEqual({ player: true });
    expect(playerOnly.suggestions?.playerId).toBe("00000000-0000-0000-0000-000000000004");
    expect(playerOnly.suggestions?.playerNumber).toBe("10");
  });

  it("suggest-only badge below preselect threshold", () => {
    const badgeSuggest = resolveIdentityJob({
      patchId: "00000000-0000-0000-0000-000000000005",
      confidences: { overall: 55, badge: 55 },
    });

    expect(badgeSuggest.status).toBe("ready");
    expect(badgeSuggest.fieldPreselect?.badge).toBeUndefined();
    expect(badgeSuggest.suggestions?.patchId).toBe("00000000-0000-0000-0000-000000000005");
  });

  it("suggests kit type without catalogKitId when type is a free enum", () => {
    const typed = resolveIdentityJob({
      clubId: "00000000-0000-0000-0000-000000000001",
      seasonId: "00000000-0000-0000-0000-000000000002",
      type: "away",
      confidences: { overall: 80, club: 80, season: 55, kitType: 55 },
    });

    expect(typed.status).toBe("ready");
    expect(typed.suggestions?.type).toBe("away");
    expect(typed.suggestions?.catalogKitId).toBeUndefined();
    expect(typed.suggestions?.seasonId).toBe("00000000-0000-0000-0000-000000000002");
  });

  it("suggests hint-only kit type using overall when kitType field score is below suggest", () => {
    const typed = resolveIdentityJob({
      clubId: "00000000-0000-0000-0000-000000000001",
      seasonId: "00000000-0000-0000-0000-000000000002",
      type: "away",
      confidences: { overall: 80, club: 80, season: 55, kitType: 45 },
    });

    expect(typed.status).toBe("ready");
    expect(typed.suggestions?.type).toBe("away");
    expect(typed.suggestions?.catalogKitId).toBeUndefined();
  });

  it("suggests mapped playerId using overall when stored player confidence is below suggest", () => {
    const playerMapped = resolveIdentityJob({
      clubId: "00000000-0000-0000-0000-000000000001",
      seasonId: "00000000-0000-0000-0000-000000000002",
      playerId: "00000000-0000-0000-0000-000000000004",
      playerNumber: "10",
      confidences: { overall: 80, club: 80, season: 55, player: 30 },
    });

    expect(playerMapped.status).toBe("ready");
    expect(playerMapped.suggestions?.playerId).toBe("00000000-0000-0000-0000-000000000004");
    expect(playerMapped.suggestions?.playerNumber).toBe("10");
  });

  it("marks ready with per-field preselect and suggest-only fields", () => {
    const highClub = resolveIdentityJob({
      clubId: "00000000-0000-0000-0000-000000000001",
      catalogKitId: "00000000-0000-0000-0000-000000000003",
      confidences: { overall: 80, club: 80, season: 55, kitType: 55 },
      seasonId: "00000000-0000-0000-0000-000000000002",
      type: "home",
    });

    expect(highClub.status).toBe("ready");
    expect(highClub.fieldPreselect).toEqual({ club: true });
    expect(highClub.suggestions?.seasonId).toBe("00000000-0000-0000-0000-000000000002");
    expect(highClub.suggestions?.type).toBe("home");
  });

  it("flags catalog miss when club hint has no catalog row", () => {
    const miss = resolveIdentityJob({
      clubHint: "Unknown FC",
      confidences: { overall: 80 },
    });

    expect(miss.status).toBe("ready");
    expect(miss.catalogMiss).toBe(true);
    expect(miss.clubHint).toBe("Unknown FC");
    expect(miss.suggestions?.clubId).toBeUndefined();
    expect(miss.suggestions?.clubLabel).toBe("Unknown FC");
    expect(miss.catalogLikely).toBeUndefined();
  });

  it("returns nationalTeamLabel and catalogLikely false when Argentina misses catalog", () => {
    const miss = resolveIdentityJob({
      clubHint: "Argentina",
      visionRaw: JSON.stringify({ clubHint: "Argentina", kitHitCount: 0 }),
      confidences: { overall: 80, club: 80 },
    });

    expect(miss.status).toBe("ready");
    expect(miss.catalogMiss).toBe(true);
    expect(miss.catalogLikely).toBe(false);
    expect(miss.suggestions?.nationalTeamLabel).toBe("Argentina");
    expect(miss.suggestions?.clubLabel).toBeUndefined();
    expect(miss.suggestions?.nationalTeamId).toBeUndefined();
  });

  it("returns nationalTeamLabel when Italy misses catalog", () => {
    const miss = resolveIdentityJob({
      clubHint: "Italy",
      confidences: { overall: 75 },
    });

    expect(miss.catalogMiss).toBe(true);
    expect(miss.catalogLikely).toBe(false);
    expect(miss.suggestions?.nationalTeamLabel).toBe("Italy");
  });

  it("surfaces nationalTeamHint for country names regardless of confidence ordering", () => {
    const miss = resolveIdentityJob({
      clubHint: "Argentina",
      confidences: { overall: 80, club: 70, nationalTeam: 85 },
    });

    expect(miss.catalogMiss).toBe(true);
    expect(miss.nationalTeamHint).toBe("Argentina");
    expect(miss.clubHint).toBeUndefined();
  });

  it("routes club catalogMiss hints to clubHint even when national-team confidence leads", () => {
    expect(
      resolveCatalogMissHints({
        clubHint: "FC Barcelona",
        confidences: { overall: 80, club: 70, nationalTeam: 85 },
      }),
    ).toEqual({ clubHint: "FC Barcelona" });

    const miss = resolveIdentityJob({
      clubHint: "FC Barcelona",
      confidences: { overall: 80, club: 70, nationalTeam: 85 },
    });

    expect(miss.catalogMiss).toBe(true);
    expect(miss.clubHint).toBe("FC Barcelona");
    expect(miss.nationalTeamHint).toBeUndefined();
  });

  it("resolveCatalogMissHints prefers visionRaw alts when clubHint is absent", () => {
    expect(
      resolveCatalogMissHints({
        visionRaw: JSON.stringify({ clubHintAlts: ["FC Barcelona"] }),
      }),
    ).toEqual({ clubHint: "FC Barcelona" });
  });

  it("flags catalog miss when only clubHintAlts are present", () => {
    expect(parseClubHintFromVisionRaw(JSON.stringify({ clubHintAlts: ["FCK"] }))).toBe("FCK");
    const miss = resolveIdentityJob({
      visionRaw: JSON.stringify({ clubHintAlts: ["Unknown FC"] }),
      confidences: { overall: 80 },
    });
    expect(miss.status).toBe("ready");
    expect(miss.catalogMiss).toBe(true);
  });

  it("does not flag catalog miss when a NationalTeam kit locked without a Club UUID", () => {
    const locked = resolveIdentityJob({
      clubHint: "Denmark",
      catalogKitId: "00000000-0000-0000-0000-000000000003",
      seasonId: "00000000-0000-0000-0000-000000000002",
      type: "home",
      confidences: { overall: 80, club: 90, season: 95, kitType: 95 },
    });

    expect(locked.catalogMiss).toBe(false);
    expect(locked.suggestions?.catalogKitId).toBe("00000000-0000-0000-0000-000000000003");
    expect(locked.suggestions?.clubId).toBeUndefined();
  });

  it("sustains strong catalog match scores when the model under-reports the field", () => {
    expect(combineModelAndMatchConfidence(0.45, 95)).toBe(95);
    expect(combineModelAndMatchConfidence(0.95, 70)).toBe(95);
    expect(combineModelAndMatchConfidence(undefined, 95)).toBe(95);
    expect(combineModelAndMatchConfidence(0, 95)).toBe(95);
    expect(combineModelAndMatchConfidence(0.45, 40)).toBe(40);
  });

  it("round-trips confidences JSON", () => {
    const original = { overall: 80, club: 85, season: 70 };
    const serialized = serializeConfidences(original);
    expect(parseConfidences(serialized)).toEqual(original);
  });

  it("parses entity hints without kitType or seasonHint", () => {
    const hints = parseVisionEvalHints(
      JSON.stringify({
        clubHint: "Zyx Unknown",
        clubHintAlts: ["ZYX"],
        playerHint: "Jonas Wind",
        patchHint: "Superligaen",
        kitType: "home",
        seasonHint: "2023/24",
      }),
    );
    expect(hints).toEqual({
      side: ["Zyx Unknown", "ZYX"],
      player: ["Jonas Wind"],
      patch: ["Superligaen"],
    });
  });

  it("round-trips kitHitCount 0 through encodeVisionEvalRaw and parseZeroKitHits", () => {
    const raw = encodeVisionEvalRaw({ clubHint: "FCK" }, 0);
    expect(parseZeroKitHits(raw)).toBe(true);
    expect(JSON.parse(raw)).toMatchObject({ clubHint: "FCK", kitHitCount: 0 });
  });

  it("does not treat missing kitHitCount as zero kit hits", () => {
    const raw = encodeVisionEvalRaw({ clubHint: "FCK" });
    expect(parseZeroKitHits(raw)).toBe(false);
    expect(JSON.parse(raw)).not.toHaveProperty("kitHitCount");
  });
});
