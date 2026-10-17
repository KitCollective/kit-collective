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
  size: "m" as const,
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
        clubs: [{ clubId: jersey.clubId, clubLabel: jersey.clubLabel, jerseyCount: 2 }],
        moreJerseys: [jersey],
      }),
    ).toEqual({
      clubs: [{ clubId: jersey.clubId, clubLabel: jersey.clubLabel, jerseyCount: 2 }],
      moreJerseys: [jersey],
    });
  });

  it("carries copy counts per side and per collector", () => {
    const parsed = collectionDiscoverHomeSchema.parse({
      collectors: [
        { handle: "samler", initial: "S", avatarUrl: null, jerseyCount: 3, openForBidCount: 1 },
      ],
      openForBid: [jersey],
    });
    expect(parsed.collectors?.[0]).toMatchObject({ jerseyCount: 3, openForBidCount: 1 });
    expect(parsed.openForBid?.[0]?.size).toBe("m");
    expect(() =>
      collectionDiscoverHomeSchema.parse({
        collectors: [{ handle: "samler", initial: "S", avatarUrl: null }],
      }),
    ).toThrow();
  });

  it("rejects unknown shelf keys", () => {
    expect(() => collectionDiscoverHomeSchema.parse({ discovery: [] })).toThrow();
  });
});
