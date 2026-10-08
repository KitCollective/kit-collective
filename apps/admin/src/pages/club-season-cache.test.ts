import { describe, expect, it } from "vitest";
import {
  clearClubSeasonDrillCache,
  peekClubSeasonDrill,
  putClubSeasonDrill,
} from "./club-season-cache.js";

describe("club season drill cache", () => {
  it("returns a stored drill for the same club and season", () => {
    clearClubSeasonDrillCache();
    const drill = {
      clubId: "550e8400-e29b-41d4-a716-446655440010",
      seasonId: "550e8400-e29b-41d4-a716-446655440011",
      clubLabel: "AC Milan",
      seasonLabel: "2025/26",
      squadCount: 0,
      kits: [],
    };
    putClubSeasonDrill(drill);
    expect(peekClubSeasonDrill(drill.clubId, drill.seasonId)).toEqual(drill);
    expect(peekClubSeasonDrill(drill.clubId, "550e8400-e29b-41d4-a716-446655440099")).toBeNull();
  });
});
