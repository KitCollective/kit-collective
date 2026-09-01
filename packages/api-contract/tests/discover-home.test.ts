import { describe, expect, it } from "vitest";
import { collectionDiscoverHomeSchema } from "../src/collection/bidding.js";

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

describe("collectionDiscoverHomeSchema", () => {
  it("omits empty shelves from a composed magazine payload", () => {
    expect(collectionDiscoverHomeSchema.parse({})).toEqual({});
    expect(
      collectionDiscoverHomeSchema.parse({
        clubs: [{ clubId: jersey.clubId, clubLabel: jersey.clubLabel }],
        moreJerseys: [jersey],
      }),
    ).toEqual({
      clubs: [{ clubId: jersey.clubId, clubLabel: jersey.clubLabel }],
      moreJerseys: [jersey],
    });
  });

  it("rejects unknown shelf keys", () => {
    expect(() => collectionDiscoverHomeSchema.parse({ discovery: [] })).toThrow();
  });
});
