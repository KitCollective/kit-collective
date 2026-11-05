import type { WishlistEntry } from "@kit/api-contract";
import { describe, expect, it } from "vitest";
import { buildWishlistViewModel } from "../src/wishlist/wishlist-view-model";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const UUID_B = "550e8400-e29b-41d4-a716-446655440001";
const UUID_C = "550e8400-e29b-41d4-a716-446655440002";

const noMatches = { matches: [], matchCount: 0, unseenCount: 0 };

const clubWish = {
  id: UUID,
  name: "F.C. København · 2023/24 · Hjemme · M",
  meta: "F.C. København · 2023/24 · Hjemme · M",
  clubId: UUID,
  clubLabel: "F.C. København",
  nationalTeamId: null,
  nationalTeamLabel: null,
  seasonId: UUID_B,
  seasonLabel: "2023/24",
  type: "home" as const,
  typeLabel: "Hjemme",
  size: "m" as const,
  sizeLabel: "M",
  ...noMatches,
} satisfies WishlistEntry;

function match(jerseyId: string, ownerHandle: string, seen: boolean) {
  return {
    jerseyId,
    thumbUrl: `/v1/collection/showcase/photos/${jerseyId}`,
    ownerHandle,
    foundAt: "2026-11-05T10:00:00.000Z",
    seen,
  };
}

describe("buildWishlistViewModel", () => {
  it("is the empty page when there are no wishes", () => {
    expect(buildWishlistViewModel([])).toEqual({ page: "empty", rows: [] });
  });

  it("shows club and season, then type and size", () => {
    const [row] = buildWishlistViewModel([clubWish]).rows;
    expect(row?.title).toBe("F.C. København · 2023/24");
    expect(row?.facetLine).toBe("Hjemme · M");
  });

  it("shows a national team the same way as a club", () => {
    const [row] = buildWishlistViewModel([
      {
        ...clubWish,
        clubId: null,
        clubLabel: null,
        nationalTeamId: UUID_C,
        nationalTeamLabel: "Danmark",
      },
    ]).rows;
    expect(row?.title).toBe("Danmark · 2023/24");
  });

  it("names the open facets Alle sæsoner and Alle størrelser", () => {
    const [row] = buildWishlistViewModel([
      { ...clubWish, seasonId: null, seasonLabel: null, size: null, sizeLabel: null },
    ]).rows;
    expect(row?.title).toBe("F.C. København · Alle sæsoner");
    expect(row?.facetLine).toBe("Hjemme · Alle størrelser");
  });

  it("leaves an open type out of the facet line and an open club out of the title", () => {
    const [row] = buildWishlistViewModel([
      {
        ...clubWish,
        clubId: null,
        clubLabel: null,
        type: null,
        typeLabel: null,
      },
    ]).rows;
    expect(row?.title).toBe("2023/24");
    expect(row?.facetLine).toBe("M");
  });

  it("shows the unseen count as a n nye pill when any Match is unseen", () => {
    const [row] = buildWishlistViewModel([
      {
        ...clubWish,
        matches: [match(UUID_B, "anna", false), match(UUID_C, "bo", true)],
        matchCount: 2,
        unseenCount: 1,
      },
    ]).rows;
    expect(row?.badge).toEqual({ kind: "new", label: "1 nye" });
    expect(row?.emptyLabel).toBeNull();
  });

  it("shows the Match count when every Match is seen", () => {
    const [row] = buildWishlistViewModel([
      {
        ...clubWish,
        matches: [match(UUID_B, "anna", true), match(UUID_C, "bo", true)],
        matchCount: 14,
        unseenCount: 0,
      },
    ]).rows;
    expect(row?.badge).toEqual({ kind: "count", label: "14" });
  });

  it("shows Ingen endnu, no badge and no thumbs for a wish without Matches", () => {
    const [row] = buildWishlistViewModel([clubWish]).rows;
    expect(row?.badge).toEqual({ kind: "none" });
    expect(row?.emptyLabel).toBe("Ingen endnu");
    expect(row?.thumbs).toEqual([]);
  });

  it("makes a thumb per Match, in order, that opens that jersey and names its owner", () => {
    const [row] = buildWishlistViewModel([
      {
        ...clubWish,
        matches: [match(UUID_B, "anna", false), match(UUID_C, "bo", true)],
        matchCount: 2,
        unseenCount: 1,
      },
    ]).rows;
    expect(row?.thumbs.map((thumb) => thumb.route)).toEqual([
      `/search/${UUID_B}`,
      `/search/${UUID_C}`,
    ]);
    expect(row?.thumbs.map((thumb) => thumb.handle)).toEqual(["anna", "bo"]);
    expect(row?.thumbs[0]?.thumbUrl).toBe(`/v1/collection/showcase/photos/${UUID_B}`);
    expect(row?.thumbs[0]?.accessibilityLabel).toBe(
      "F.C. København · 2023/24, Hjemme · M, fra @anna",
    );
  });

  it("keeps a thumb without a photo", () => {
    const [row] = buildWishlistViewModel([
      {
        ...clubWish,
        matches: [{ ...match(UUID_B, "anna", false), thumbUrl: null }],
        matchCount: 1,
        unseenCount: 1,
      },
    ]).rows;
    expect(row?.thumbs[0]?.thumbUrl).toBeNull();
  });

  it("names the facets and the number of new Matches in the row's accessible name", () => {
    const rows = buildWishlistViewModel([
      { ...clubWish, matches: [match(UUID_B, "anna", false)], matchCount: 1, unseenCount: 1 },
      { ...clubWish, id: UUID_C, matches: [], matchCount: 0, unseenCount: 0 },
      {
        ...clubWish,
        id: UUID_B,
        matches: [match(UUID_B, "anna", false), match(UUID_C, "bo", false)],
        matchCount: 2,
        unseenCount: 2,
      },
    ]).rows;
    expect(rows[0]?.accessibilityLabel).toBe("F.C. København · 2023/24, Hjemme · M, 1 ny match");
    expect(rows[1]?.accessibilityLabel).toBe("F.C. København · 2023/24, Hjemme · M, 0 nye matches");
    expect(rows[2]?.accessibilityLabel).toBe("F.C. København · 2023/24, Hjemme · M, 2 nye matches");
  });

  it("is the list page with a row per wish, in the API's order", () => {
    const model = buildWishlistViewModel([clubWish, { ...clubWish, id: UUID_C }]);
    expect(model.page).toBe("list");
    expect(model.rows.map((row) => row.id)).toEqual([UUID, UUID_C]);
  });
});
