import { describe, expect, it } from "vitest";
import {
  adminClubDrillSchema,
  adminClubSeasonDrillSchema,
  adminClubSeasonKitsFetchSchema,
  adminKitDrillSchema,
} from "../src/index.js";

const ids = {
  club: "550e8400-e29b-41d4-a716-446655440010",
  season: "550e8400-e29b-41d4-a716-446655440011",
  player: "550e8400-e29b-41d4-a716-446655440012",
  kit: "550e8400-e29b-41d4-a716-446655440013",
  variantKit: "550e8400-e29b-41d4-a716-446655440014",
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
      honours: [],
      foundedOn: "1992-07-01",
      stadiumName: "Parken",
      stadiumCapacity: 38065,
      websiteUrl: "https://www.fck.dk",
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
      squad: [
        { id: ids.player, label: "Player One", squadNumber: 10, position: "Central Midfield" },
      ],
      kits: [
        {
          id: ids.kit,
          label: "FC Copenhagen home",
          kitType: "home" as const,
          variantCount: 1,
          hasPhoto: true,
          photoPath: `/admin/catalog/kits/${ids.kit}/photo`,
        },
      ],
    };
    expect(adminClubSeasonDrillSchema.parse(drill)).toEqual(drill);
  });
});

describe("adminClubSeasonKitsFetchSchema", () => {
  it("accepts upsert counts from listing ingest", () => {
    expect(adminClubSeasonKitsFetchSchema.parse({ kitsUpserted: 2, photosWritten: 1 })).toEqual({
      kitsUpserted: 2,
      photosWritten: 1,
    });
  });
});

describe("adminKitDrillSchema", () => {
  it("accepts extra archive photos and FKA facts", () => {
    const drill = {
      id: ids.kit,
      label: "AC Milan home",
      kitType: "home" as const,
      clubId: ids.club,
      clubLabel: "AC Milan",
      clubMonogram: "AM",
      clubMarkPath: `/admin/catalog/clubs/${ids.club}/mark`,
      seasonLabel: "2025/26",
      brandLabel: "Puma",
      sponsorName: "Emirates",
      design: "Stripes",
      colorNames: "Red / Black / White",
      competition: "Serie A",
      releasedOn: "2025-05-20",
      description: "Monochrome club crest.",
      hasPhoto: true,
      photoPath: `/admin/catalog/kits/${ids.kit}/photo`,
      photos: [{ id: ids.kit, path: `/admin/catalog/kits/${ids.kit}/photos/${ids.kit}` }],
      variants: [
        {
          id: ids.variantKit,
          variant: "supercoppa-italiana",
          label: "AC Milan home supercoppa-italiana",
          competition: "EA SPORTS FC Supercup",
          hasPhoto: true,
          photoPath: `/admin/catalog/kits/${ids.variantKit}/photo`,
        },
      ],
    };
    expect(adminKitDrillSchema.parse(drill)).toEqual(drill);
  });
});
