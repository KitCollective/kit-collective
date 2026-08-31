import {
  findFirstWishlistMatch,
  isWishlistMatchCandidate,
  matchesWishlistFacets,
} from "@kit/domain";
import { describe, expect, it } from "vitest";
import { wishlistEntrySchema } from "../src/wishlist/entries.js";

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
  seasonId: SEASON,
  type: "home" as const,
  size: "m" as const,
  biddingEnabled: true,
  catalogKitId: null,
  private: false,
};

describe("matchesWishlistFacets", () => {
  it("requires every set facet (AND)", () => {
    const criteria = { clubId: CLUB, seasonId: SEASON, type: "home" as const, size: "m" as const };
    expect(matchesWishlistFacets(criteria, baseJersey)).toBe(true);
    expect(matchesWishlistFacets(criteria, { ...baseJersey, type: "away" })).toBe(false);
  });

  it("treats unset facets as wildcards", () => {
    expect(
      matchesWishlistFacets({ clubId: CLUB, seasonId: null, type: null, size: null }, baseJersey),
    ).toBe(true);
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
      { clubId: CLUB, seasonId: SEASON, type: "home", size: null },
      OWNER,
      [baseJersey],
    );
    expect(matched).toBe(JERSEY);
  });
});

describe("wishlistEntrySchema match field", () => {
  it("accepts matchedJerseyId on list rows", () => {
    const payload = {
      id: OWNER,
      name: "F.C. København",
      meta: "F.C. København",
      clubId: CLUB,
      clubLabel: "F.C. København",
      seasonId: null,
      seasonLabel: null,
      type: null,
      typeLabel: null,
      size: null,
      sizeLabel: null,
      matchedJerseyId: JERSEY,
    };
    expect(wishlistEntrySchema.parse(payload)).toEqual(payload);
  });

  it("accepts null matchedJerseyId when entitlement lapsed or no hit", () => {
    const payload = {
      id: OWNER,
      name: "F.C. København",
      meta: "F.C. København",
      clubId: CLUB,
      clubLabel: "F.C. København",
      seasonId: null,
      seasonLabel: null,
      type: null,
      typeLabel: null,
      size: null,
      sizeLabel: null,
      matchedJerseyId: null,
    };
    expect(wishlistEntrySchema.parse(payload)).toEqual(payload);
  });
});
