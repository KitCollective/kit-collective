import {
  findFirstWishlistMatch,
  isWishlistMatchCandidate,
  matchesWishlistFacets,
} from "@kit/domain";
import { describe, expect, it } from "vitest";
import {
  WISHLIST_MATCH_CAP,
  wishlistEntriesSchema,
  wishlistEntrySchema,
  wishlistUnseenCountSchema,
} from "../src/wishlist/entries.js";

const OWNER = "550e8400-e29b-41d4-a716-446655440000";
const PEER = "550e8400-e29b-41d4-a716-446655440001";
const JERSEY = "550e8400-e29b-41d4-a716-446655440002";
const CLUB = "550e8400-e29b-41d4-a716-446655440003";
const SEASON = "550e8400-e29b-41d4-a716-446655440004";
const KIT = "550e8400-e29b-41d4-a716-446655440005";

const baseJersey = {
  id: JERSEY,
  ownerUserId: PEER,
  clubId: CLUB,
  nationalTeamId: null,
  seasonId: SEASON,
  type: "home" as const,
  size: "m" as const,
  biddingEnabled: true,
  catalogKitId: null,
  private: false,
};

describe("matchesWishlistFacets", () => {
  it("requires every set facet (AND)", () => {
    const criteria = {
      clubId: CLUB,
      nationalTeamId: null,
      seasonId: SEASON,
      type: "home" as const,
      size: "m" as const,
    };
    expect(matchesWishlistFacets(criteria, baseJersey)).toBe(true);
    expect(matchesWishlistFacets(criteria, { ...baseJersey, type: "away" })).toBe(false);
  });

  it("AND-matches nationalTeamId independently of clubId", () => {
    const ntJersey = {
      ...baseJersey,
      clubId: null,
      nationalTeamId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    };
    expect(
      matchesWishlistFacets(
        {
          clubId: null,
          nationalTeamId: ntJersey.nationalTeamId,
          seasonId: null,
          type: null,
          size: null,
        },
        ntJersey,
      ),
    ).toBe(true);
    expect(
      matchesWishlistFacets(
        {
          clubId: null,
          nationalTeamId: ntJersey.nationalTeamId,
          seasonId: null,
          type: null,
          size: null,
        },
        baseJersey,
      ),
    ).toBe(false);
  });
});

describe("isWishlistMatchCandidate", () => {
  it("excludes own Save", () => {
    expect(isWishlistMatchCandidate({ ...baseJersey, ownerUserId: OWNER }, OWNER)).toBe(false);
  });

  it("excludes closed copies (bidding disabled)", () => {
    expect(isWishlistMatchCandidate({ ...baseJersey, biddingEnabled: false }, OWNER)).toBe(false);
  });

  it("excludes private copies", () => {
    expect(isWishlistMatchCandidate({ ...baseJersey, private: true }, OWNER)).toBe(false);
  });

  it("excludes seed Kits linked on UserJersey", () => {
    expect(isWishlistMatchCandidate({ ...baseJersey, catalogKitId: KIT }, OWNER)).toBe(false);
  });

  it("accepts bidding-enabled peer jerseys without catalog kit", () => {
    expect(isWishlistMatchCandidate(baseJersey, OWNER)).toBe(true);
  });
});

describe("findFirstWishlistMatch", () => {
  it("returns the first eligible peer match", () => {
    const matched = findFirstWishlistMatch(
      { clubId: CLUB, nationalTeamId: null, seasonId: SEASON, type: "home", size: null },
      OWNER,
      [baseJersey],
    );
    expect(matched).toBe(JERSEY);
  });
});

const entryBase = {
  id: OWNER,
  name: "F.C. København",
  meta: "F.C. København",
  clubId: CLUB,
  clubLabel: "F.C. København",
  nationalTeamId: null,
  nationalTeamLabel: null,
  seasonId: null,
  seasonLabel: null,
  type: null,
  typeLabel: null,
  size: null,
  sizeLabel: null,
};

describe("wishlistEntrySchema matches", () => {
  it("carries every Match with thumb, owner Handle, found time and seen, plus the counts", () => {
    const payload = {
      ...entryBase,
      matches: [
        {
          jerseyId: JERSEY,
          thumbUrl: "/v1/collection/showcase/photos/550e8400-e29b-41d4-a716-446655440009",
          ownerHandle: "peer",
          foundAt: "2026-11-05T10:00:00.000Z",
          seen: false,
        },
        {
          jerseyId: KIT,
          thumbUrl: null,
          ownerHandle: "other",
          foundAt: "2026-11-04T10:00:00.000Z",
          seen: true,
        },
      ],
      matchCount: 12,
      unseenCount: 1,
    };
    expect(wishlistEntrySchema.parse(payload)).toEqual(payload);
  });

  it("accepts a wish with no Matches", () => {
    const payload = { ...entryBase, matches: [], matchCount: 0, unseenCount: 0 };
    expect(wishlistEntrySchema.parse(payload)).toEqual(payload);
  });

  it("rejects the old single matchedJerseyId", () => {
    expect(() =>
      wishlistEntrySchema.parse({
        ...entryBase,
        matches: [],
        matchCount: 0,
        unseenCount: 0,
        matchedJerseyId: JERSEY,
      }),
    ).toThrow();
  });

  it("rejects more Matches than the cap", () => {
    const match = {
      jerseyId: JERSEY,
      thumbUrl: null,
      ownerHandle: "peer",
      foundAt: "2026-11-05T10:00:00.000Z",
      seen: false,
    };
    expect(() =>
      wishlistEntrySchema.parse({
        ...entryBase,
        matches: Array.from({ length: WISHLIST_MATCH_CAP + 1 }, () => match),
        matchCount: WISHLIST_MATCH_CAP + 1,
        unseenCount: WISHLIST_MATCH_CAP + 1,
      }),
    ).toThrow();
  });
});

describe("wishlistEntriesSchema", () => {
  it("returns the total unseen count next to the entries", () => {
    const payload = {
      entries: [{ ...entryBase, matches: [], matchCount: 0, unseenCount: 0 }],
      unseenCount: 3,
    };
    expect(wishlistEntriesSchema.parse(payload)).toEqual(payload);
  });
});

describe("wishlistUnseenCountSchema", () => {
  it("is the light badge response", () => {
    expect(wishlistUnseenCountSchema.parse({ unseenCount: 2 })).toEqual({ unseenCount: 2 });
    expect(() => wishlistUnseenCountSchema.parse({ unseenCount: -1 })).toThrow();
  });
});
