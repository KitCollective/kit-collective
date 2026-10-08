import { describe, expect, it } from "vitest";
import { catalogStatsSchema } from "../src/catalog/stats.js";

describe("catalogStatsSchema", () => {
  it("accepts integer counts only", () => {
    const stats = {
      countries: 0,
      leagues: 0,
      clubs: 1,
      nationalTeams: 0,
      seasons: 1,
      teamSeasons: 0,
      players: 0,
      playerClubSeasons: 0,
      manufacturers: 0,
      kits: 0,
      kitPhotos: 0,
      catalogLabels: 2,
      externalIds: 0,
      users: 0,
    };
    expect(catalogStatsSchema.parse(stats)).toEqual(stats);
  });

  it("rejects non-integer or negative counts", () => {
    expect(() =>
      catalogStatsSchema.parse({
        countries: 1.5,
        leagues: 0,
        clubs: 0,
        nationalTeams: 0,
        seasons: 0,
        teamSeasons: 0,
        players: 0,
        playerClubSeasons: 0,
        manufacturers: 0,
        kits: 0,
        kitPhotos: 0,
        catalogLabels: 0,
        externalIds: 0,
        users: 0,
      }),
    ).toThrow();
  });

  it("rejects extra fields (no KitPhoto bytes)", () => {
    expect(() =>
      catalogStatsSchema.parse({
        countries: 0,
        leagues: 0,
        clubs: 0,
        nationalTeams: 0,
        seasons: 0,
        teamSeasons: 0,
        players: 0,
        playerClubSeasons: 0,
        manufacturers: 0,
        kits: 0,
        kitPhotos: 0,
        catalogLabels: 0,
        externalIds: 0,
        users: 0,
        photoBytes: "base64data",
      }),
    ).toThrow();
  });
});
