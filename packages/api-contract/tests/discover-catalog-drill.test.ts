import { describe, expect, it } from "vitest";
import { collectionDiscoverCatalogDrillSchema } from "../src/collection/bidding.js";

const jersey = {
  id: "11111111-1111-4111-8111-111111111111",
  clubId: "22222222-2222-4222-8222-222222222222",
  seasonId: "33333333-3333-4333-8333-333333333333",
  type: "home" as const,
  clubLabel: "F.C. København",
  seasonLabel: "2023/24",
  ownerHandle: "samler",
  photos: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      role: "front" as const,
      source: "gallery" as const,
      objectKey: "user/owner/jersey/front.jpg",
      photoUrl: "/v1/collection/jerseys/11111111-1111-4111-8111-111111111111/photos/front",
      ocrStatus: "none" as const,
    },
  ],
};

describe("collectionDiscoverCatalogDrillSchema", () => {
  it("accepts a Club or Player drill with a matching jersey grid", () => {
    expect(
      collectionDiscoverCatalogDrillSchema.parse({
        kind: "club",
        id: jersey.clubId,
        title: "F.C. København",
        count: 1,
        jerseys: [jersey],
      }),
    ).toEqual({
      kind: "club",
      id: jersey.clubId,
      title: "F.C. København",
      count: 1,
      jerseys: [jersey],
    });
  });

  it("rejects League or Season landings", () => {
    expect(() =>
      collectionDiscoverCatalogDrillSchema.parse({
        kind: "league",
        id: jersey.clubId,
        title: "Superligaen",
        count: 0,
        jerseys: [],
      }),
    ).toThrow();
  });
});
