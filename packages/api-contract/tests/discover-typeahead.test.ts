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

describe("collectionDiscoverTypeaheadSchema", () => {
  it("accepts optional typeahead sections and omits empty keys", () => {
    expect(
      collectionDiscoverTypeaheadSchema.parse({
        clubs: [{ clubId: jersey.clubId, clubLabel: "F.C. København", jerseyCount: 2 }],
        nationalTeams: [
          {
            nationalTeamId: "77777777-7777-4777-8777-777777777777",
            nationalTeamLabel: "Danmark",
            jerseyCount: 0,
          },
        ],
        kits: [
          {
            kitId: "55555555-5555-4555-8555-555555555555",
            label: "F.C. København 2023/24 Hjemmebane",
            jerseyCount: 1,
            photo: jersey.photos[0],
          },
        ],
        players: [
          {
            playerId: "66666666-6666-4666-8666-666666666666",
            playerLabel: "Jonas Wind",
            jerseyCount: 3,
            number: 9,
          },
        ],
        collectors: [{ handle: "samler", initial: "S", avatarUrl: null, jerseyCount: 4 }],
        jerseys: [jersey],
      }),
    ).toMatchObject({
      clubs: [{ clubId: jersey.clubId, clubLabel: "F.C. København", jerseyCount: 2 }],
      nationalTeams: [{ nationalTeamLabel: "Danmark", jerseyCount: 0 }],
      kits: [{ jerseyCount: 1, photo: { id: jersey.photos[0]?.id } }],
      players: [{ playerLabel: "Jonas Wind", jerseyCount: 3, number: 9 }],
      collectors: [{ handle: "samler", jerseyCount: 4 }],
    });

    expect(collectionDiscoverTypeaheadSchema.parse({})).toEqual({});
  });

  it("allows a kit without a photo and a player without a squad number", () => {
    const parsed = collectionDiscoverTypeaheadSchema.parse({
      kits: [
        {
          kitId: "55555555-5555-4555-8555-555555555555",
          label: "F.C. København 2023/24 Hjemmebane",
          jerseyCount: 0,
          photo: null,
        },
      ],
      players: [
        {
          playerId: "66666666-6666-4666-8666-666666666666",
          playerLabel: "Jonas Wind",
          jerseyCount: 0,
          number: null,
        },
      ],
    });
    expect(parsed.kits?.[0]?.photo).toBeNull();
    expect(parsed.players?.[0]?.number).toBeNull();
  });

  it("requires a non-negative integer jerseyCount on every hit kind", () => {
    const club = { clubId: jersey.clubId, clubLabel: "F.C. København" };
    expect(() => collectionDiscoverTypeaheadSchema.parse({ clubs: [club] })).toThrow();
    expect(() =>
      collectionDiscoverTypeaheadSchema.parse({ clubs: [{ ...club, jerseyCount: -1 }] }),
    ).toThrow();
    expect(() =>
      collectionDiscoverTypeaheadSchema.parse({ clubs: [{ ...club, jerseyCount: 1.5 }] }),
    ).toThrow();
    expect(() =>
      collectionDiscoverTypeaheadSchema.parse({
        collectors: [{ handle: "samler", initial: "S", avatarUrl: null }],
      }),
    ).toThrow();
  });

  it("rejects League landings", () => {
    expect(() =>
      collectionDiscoverTypeaheadSchema.parse({
        leagues: [{ id: jersey.clubId, label: "Superligaen" }],
      }),
    ).toThrow();
  });
});
