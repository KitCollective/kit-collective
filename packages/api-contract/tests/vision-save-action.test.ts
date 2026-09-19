import type { KitType } from "@kit/domain";
import { describe, expect, it } from "vitest";
import { VISION_JOB_STATUSES } from "../src/collection/vision.js";
import { resolveVisionSaveAction } from "../src/collection/vision-save-action.js";

const CLUB = "33333333-3333-3333-3333-333333333333";
const SEASON = "44444444-4444-4444-4444-444444444444";
const OTHER_CLUB = "55555555-5555-5555-5555-555555555555";
const KIT_TYPE: KitType = "home";

describe("resolveVisionSaveAction", () => {
  it("returns ignored for pending, failed, and noop (ratchet KIT-27)", () => {
    for (const status of ["pending", "failed", "noop"] as const) {
      const result = resolveVisionSaveAction({
        status,
        selectedClubId: CLUB,
        selectedSeasonId: SEASON,
        selectedKitType: KIT_TYPE,
      });
      expect(result.action).toBe("ignored");
    }
  });

  it("returns a userAction for every VisionJobStatus (ratchet KIT-27)", () => {
    for (const status of VISION_JOB_STATUSES) {
      const result = resolveVisionSaveAction({
        status,
        suggestions:
          status === "ready" ? { clubId: CLUB, seasonId: SEASON, type: KIT_TYPE } : undefined,
        selectedClubId: CLUB,
        selectedSeasonId: SEASON,
        selectedKitType: KIT_TYPE,
      });
      expect(["accepted", "edited", "ignored"]).toContain(result.action);
    }
  });

  it("returns accepted when ready suggestions fully match user selection", () => {
    const result = resolveVisionSaveAction({
      status: "ready",
      suggestions: { clubId: CLUB, seasonId: SEASON, type: KIT_TYPE },
      selectedClubId: CLUB,
      selectedSeasonId: SEASON,
      selectedKitType: KIT_TYPE,
    });
    expect(result).toEqual({
      action: "accepted",
      clubId: CLUB,
      seasonId: SEASON,
      type: KIT_TYPE,
    });
  });

  it("returns edited when ready suggestions partially match", () => {
    const result = resolveVisionSaveAction({
      status: "ready",
      suggestions: { clubId: CLUB, seasonId: OTHER_CLUB, type: "away" },
      selectedClubId: CLUB,
      selectedSeasonId: SEASON,
      selectedKitType: KIT_TYPE,
    });
    expect(result.action).toBe("edited");
    expect(result.clubId).toBe(CLUB);
  });

  it("returns ignored when ready suggestions do not match at all", () => {
    const result = resolveVisionSaveAction({
      status: "ready",
      suggestions: { clubId: OTHER_CLUB, seasonId: OTHER_CLUB, type: "away" },
      selectedClubId: CLUB,
      selectedSeasonId: SEASON,
      selectedKitType: KIT_TYPE,
    });
    expect(result.action).toBe("ignored");
  });

  it("returns ignored when ready but suggestions are missing", () => {
    const result = resolveVisionSaveAction({
      status: "ready",
      selectedClubId: CLUB,
      selectedSeasonId: SEASON,
      selectedKitType: KIT_TYPE,
    });
    expect(result.action).toBe("ignored");
  });
});
