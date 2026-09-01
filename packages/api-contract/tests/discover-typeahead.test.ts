import { describe, expect, it } from "vitest";
import { collectionDiscoverTypeaheadSchema } from "../src/collection/bidding.js";

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

describe("collectionDiscoverTypeaheadSchema", () => {
  it("accepts optional typeahead sections and omits empty keys", () => {
    expect(
      collectionDiscoverTypeaheadSchema.parse({
        clubs: [{ clubId: jersey.clubId, clubLabel: "F.C. København" }],
        kits: [
          {
            kitId: "55555555-5555-4555-8555-555555555555",
            label: "F.C. København 2023/24 Hjemmebane",
          },
        ],
        players: [{ playerId: "66666666-6666-4666-8666-666666666666", playerLabel: "Jonas Wind" }],
        collectors: [{ handle: "samler", initial: "S", avatarUrl: null }],
        jerseys: [jersey],
      }),
    ).toMatchObject({
      clubs: [{ clubId: jersey.clubId, clubLabel: "F.C. København" }],
      players: [{ playerLabel: "Jonas Wind" }],
    });

    expect(collectionDiscoverTypeaheadSchema.parse({})).toEqual({});
  });

  it("rejects League or NationalTeam landings", () => {
    expect(() =>
      collectionDiscoverTypeaheadSchema.parse({
        leagues: [{ id: jersey.clubId, label: "Superligaen" }],
      }),
    ).toThrow();
  });
});
