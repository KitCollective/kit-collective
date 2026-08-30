import type { WishlistEntry } from "@kit/api-contract";
import { describe, expect, it } from "vitest";
import {
  buildWishlistWritePayload,
  canSaveWishlistEntry,
  emptyWishlistCriteria,
  hasWishlistCriterion,
  hasWishlistHit,
  hitRowAccessibilityLabel,
  manageRowAccessibilityLabel,
  resolveWishlistEmptyBody,
  resolveWishlistEmptyTitle,
  resolveWishlistHitRoute,
  resolveWishlistSheetTitle,
  seedCriteriaForEdit,
  WISHLIST_AND_HELPER_COPY,
} from "../src/components/wishlist-sheet-logic";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const UUID_B = "550e8400-e29b-41d4-a716-446655440001";

const baseEntry = {
  id: UUID,
  name: "F.C. København · 2023/24 · Hjemme · M",
  meta: "F.C. København · 2023/24 · Hjemme · M",
  clubId: UUID,
  clubLabel: "F.C. København",
  seasonId: UUID_B,
  seasonLabel: "2023/24",
  type: "home" as const,
  typeLabel: "Hjemme",
  size: "m" as const,
  sizeLabel: "M",
  matchedJerseyId: null,
} satisfies WishlistEntry;

describe("resolveWishlistSheetTitle", () => {
  it("uses locked Ønske title for list mode", () => {
    expect(resolveWishlistSheetTitle("list")).toBe("Ønske");
  });

  it("uses locked Ny ønskerække title for form mode", () => {
    expect(resolveWishlistSheetTitle("form")).toBe("Ny ønskerække");
  });
});

describe("WISHLIST_AND_HELPER_COPY", () => {
  it("states that criteria combine with AND", () => {
    expect(WISHLIST_AND_HELPER_COPY).toMatch(/OG/i);
  });
});

describe("hasWishlistCriterion", () => {
  it("requires at least one of club, season, or type", () => {
    expect(hasWishlistCriterion(emptyWishlistCriteria())).toBe(false);
    expect(
      hasWishlistCriterion({
        ...emptyWishlistCriteria(),
        club: { id: UUID, label: "FCK" },
      }),
    ).toBe(true);
    expect(
      hasWishlistCriterion({
        ...emptyWishlistCriteria(),
        size: "m",
      }),
    ).toBe(false);
  });
});

describe("canSaveWishlistEntry", () => {
  it("disables Gem until a criterion is set and while saving", () => {
    expect(canSaveWishlistEntry(emptyWishlistCriteria(), false)).toBe(false);
    expect(
      canSaveWishlistEntry(
        {
          ...emptyWishlistCriteria(),
          type: "home",
        },
        false,
      ),
    ).toBe(true);
    expect(
      canSaveWishlistEntry(
        {
          ...emptyWishlistCriteria(),
          type: "home",
        },
        true,
      ),
    ).toBe(false);
  });
});

describe("buildWishlistWritePayload", () => {
  it("maps selected criteria to contract write shape", () => {
    expect(
      buildWishlistWritePayload({
        club: { id: UUID, label: "FCK" },
        season: { id: UUID_B, label: "2023/24" },
        type: "home",
        size: "m",
      }),
    ).toEqual({
      clubId: UUID,
      seasonId: UUID_B,
      type: "home",
      size: "m",
    });
  });
});

describe("seedCriteriaForEdit", () => {
  it("seeds form pickers from an existing entry", () => {
    expect(seedCriteriaForEdit(baseEntry)).toEqual({
      club: { id: UUID, label: "F.C. København" },
      season: { id: UUID_B, label: "2023/24" },
      type: "home",
      size: "m",
    });
  });
});

describe("manageRowAccessibilityLabel", () => {
  it("includes auto-name and AND meta for list row manage", () => {
    expect(manageRowAccessibilityLabel(baseEntry.name, baseEntry.meta)).toBe(
      `${baseEntry.name}, ${baseEntry.meta}`,
    );
  });
});

describe("resolveWishlistEmptyTitle", () => {
  it("uses Danish empty collection copy", () => {
    expect(resolveWishlistEmptyTitle()).toBe("Ingen ønsker endnu");
  });
});

describe("resolveWishlistEmptyBody", () => {
  it("uses one-sentence empty collection body copy", () => {
    const body = resolveWishlistEmptyBody();
    expect(body.length).toBeGreaterThan(0);
    expect(body).toMatch(/Tilføj/i);
  });
});

describe("hasWishlistHit", () => {
  it("detects fillSecondary hit rows from matchedJerseyId", () => {
    expect(hasWishlistHit({ ...baseEntry, matchedJerseyId: UUID_B })).toBe(true);
    expect(hasWishlistHit(baseEntry)).toBe(false);
  });
});

describe("hitRowAccessibilityLabel", () => {
  it("uses Danish Match copy for hit rows", () => {
    expect(hitRowAccessibilityLabel(baseEntry.name, baseEntry.meta)).toMatch(/Match/i);
  });
});

describe("resolveWishlistHitRoute", () => {
  it("opens foreign UserJersey detail via send-bid route", () => {
    expect(resolveWishlistHitRoute(UUID_B)).toBe(`/search/send-bid/${UUID_B}`);
  });
});
