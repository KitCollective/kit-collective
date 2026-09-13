import { describe, expect, it } from "vitest";
import {
  combineModelAndMatchConfidence,
  computeOverallConfidence,
  parseConfidences,
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
    expect(miss.suggestions?.clubId).toBeUndefined();
  });

  it("caps a catalog match by the model's field confidence", () => {
    expect(combineModelAndMatchConfidence(0.45, 95)).toBe(45);
    expect(combineModelAndMatchConfidence(0.95, 70)).toBe(70);
    expect(combineModelAndMatchConfidence(undefined, 95)).toBe(95);
    expect(combineModelAndMatchConfidence(0, 95)).toBe(0);
  });

  it("round-trips confidences JSON", () => {
    const original = { overall: 80, club: 85, season: 70 };
    const serialized = serializeConfidences(original);
    expect(parseConfidences(serialized)).toEqual(original);
  });
});
