import { describe, expect, it } from "vitest";
import { adminClubDrillSchema, adminClubSeasonDrillSchema } from "../src/index.js";

const ids = {
  club: "550e8400-e29b-41d4-a716-446655440010",
  season: "550e8400-e29b-41d4-a716-446655440011",
  player: "550e8400-e29b-41d4-a716-446655440012",
  kit: "550e8400-e29b-41d4-a716-446655440013",
};

describe("adminClubDrillSchema", () => {
  it("accepts club identity plus seasons for the drill picker", () => {
    const drill = {
      id: ids.club,
      label: "FC Copenhagen",
      countryLabel: "Denmark",
      monogram: "FC",
      kind: "club" as const,
      validFrom: "1992-07-01",
      validTo: null,
      seasons: [{ id: ids.season, label: "2024/25" }],
    };
    expect(adminClubDrillSchema.parse(drill)).toEqual(drill);
  });

  it("rejects a club drill without seasons", () => {
    expect(() =>
      adminClubDrillSchema.parse({
        id: ids.club,
        label: "FC Copenhagen",
        monogram: "FC",
      }),
    ).toThrow();
  });
});

describe("adminClubSeasonDrillSchema", () => {
  it("accepts squad plus kits for the selected club season", () => {
    const drill = {
      clubId: ids.club,
      seasonId: ids.season,
      clubLabel: "FC Copenhagen",
      seasonLabel: "2024/25",
      squadCount: 1,
      squad: [{ id: ids.player, label: "Player One", squadNumber: 10 }],
      kits: [
        {
          id: ids.kit,
          label: "FC Copenhagen home",
          kitType: "home" as const,
          hasPhoto: true,
          photoPath: `/admin/catalog/kits/${ids.kit}/photo`,
        },
      ],
    };
    expect(adminClubSeasonDrillSchema.parse(drill)).toEqual(drill);
  });
});
