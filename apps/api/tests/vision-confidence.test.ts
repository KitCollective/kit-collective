import { describe, expect, it } from "vitest";
import {
  computeOverallConfidence,
  parseConfidences,
  resolveVisionStatus,
  serializeConfidences,
  shouldPreselect,
} from "../dist/vision/vision-confidence.js";

describe("vision-confidence", () => {
  it("uses model confidence only for overall (not inflated by match scores)", () => {
    expect(computeOverallConfidence(0.3)).toBe(30);
    expect(computeOverallConfidence(undefined)).toBe(0);

    const lowModel = resolveVisionStatus({
      clubId: "00000000-0000-0000-0000-000000000001",
      confidences: { overall: 30, club: 90, season: 85 },
    });
    expect(lowModel.status).toBe("noop");
    expect(shouldPreselect({ overall: 30 })).toBe(false);
  });

  it("preselects at ≥70% overall confidence", () => {
    const confidences = { overall: 72 };
    expect(shouldPreselect(confidences)).toBe(true);
    expect(shouldPreselect({ overall: 69 })).toBe(false);
  });

  it("marks ready for 50–69% and noop below 50%", () => {
    const mid = resolveVisionStatus({
      clubId: "00000000-0000-0000-0000-000000000001",
      confidences: { overall: 55 },
    });
    expect(mid.status).toBe("ready");

    const low = resolveVisionStatus({
      clubId: "00000000-0000-0000-0000-000000000001",
      confidences: { overall: 40 },
    });
    expect(low.status).toBe("noop");
    expect(low.result?.clubId).toBeUndefined();
  });

  it("round-trips confidences JSON", () => {
    const original = { overall: 80, club: 85, season: 70 };
    const serialized = serializeConfidences(original);
    expect(parseConfidences(serialized)).toEqual(original);
  });
});
