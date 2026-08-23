import type { CollectionJersey } from "@kit/api-contract";
import { describe, expect, it } from "vitest";
import {
  buildGenvejeWritePayload,
  canSaveGenvej,
  deriveMostUsedFacets,
  emptyGenvejeFacets,
  GENVEJE_AND_HELPER_COPY,
  manageRowAccessibilityLabel,
  reorderShortcutIds,
  resolveGenvejeSheetTitle,
  seedClubForEdit,
  seedFacetsForEdit,
  shouldFallbackToAlleOnFetchError,
  shouldResetShortcutAfterDelete,
  shouldResetToAlleAfterGem,
} from "../src/components/genveje-sheet-logic";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const UUID_B = "550e8400-e29b-41d4-a716-446655440001";
const UUID_C = "550e8400-e29b-41d4-a716-446655440002";

const baseShortcut = {
  id: UUID,
  name: "FCK",
  sortOrder: 0,
  countryId: null,
  countryLabel: null,
  leagueId: null,
  leagueLabel: null,
  clubId: UUID,
  clubLabel: "F.C. København",
  playerId: null,
  playerLabel: null,
  matchCount: 2,
};

const baseJersey = {
  id: UUID,
  clubId: UUID,
  seasonId: UUID_B,
  countryId: UUID_C,
  leagueId: UUID_B,
  catalogKitId: null,
  type: "home" as const,
  size: "m" as const,
  condition: "used" as const,
  clubLabel: "F.C. København",
  seasonLabel: "2023/24",
  photos: [
    {
      id: UUID,
      role: "front" as const,
      source: "gallery" as const,
      objectKey: "user/x/front.jpg",
      photoUrl: "/v1/collection/photos/x",
      ocrStatus: "none" as const,
    },
  ],
} satisfies CollectionJersey;

describe("resolveGenvejeSheetTitle", () => {
  it("uses locked Genveje title for list mode", () => {
    expect(resolveGenvejeSheetTitle("list")).toBe("Genveje");
  });

  it("uses locked Ny genvej title for add and edit form mode", () => {
    expect(resolveGenvejeSheetTitle("form")).toBe("Ny genvej");
  });
});

describe("GENVEJE_AND_HELPER_COPY", () => {
  it("states that facets combine with AND", () => {
    expect(GENVEJE_AND_HELPER_COPY).toMatch(/OG/i);
  });
});

describe("canSaveGenvej", () => {
  it("disables Gem until at least one facet is set", () => {
    expect(canSaveGenvej(emptyGenvejeFacets(), false)).toBe(false);
    expect(
      canSaveGenvej(
        {
          ...emptyGenvejeFacets(),
          club: { id: UUID, label: "F.C. København" },
        },
        false,
      ),
    ).toBe(true);
    expect(
      canSaveGenvej(
        {
          ...emptyGenvejeFacets(),
          club: { id: UUID, label: "F.C. København" },
        },
        true,
      ),
    ).toBe(false);
  });
});

describe("buildGenvejeWritePayload", () => {
  it("includes only set facets and optional custom name", () => {
    expect(
      buildGenvejeWritePayload(
        {
          country: { id: UUID_C, label: "Danmark" },
          league: null,
          club: { id: UUID, label: "F.C. København" },
          player: null,
        },
        "",
      ),
    ).toEqual({ countryId: UUID_C, clubId: UUID });
  });
});

describe("seedFacetsForEdit", () => {
  it("seeds all facet pickers from shortcut labels", () => {
    expect(
      seedFacetsForEdit({
        ...baseShortcut,
        countryId: UUID_C,
        countryLabel: "Danmark",
        playerId: UUID_B,
        playerLabel: "Jonas Wind",
      }),
    ).toEqual({
      country: { id: UUID_C, label: "Danmark" },
      league: null,
      club: { id: UUID, label: "F.C. København" },
      player: { id: UUID_B, label: "Jonas Wind" },
    });
  });
});

describe("seedClubForEdit", () => {
  it("seeds the club picker with the resolved club label", () => {
    expect(seedClubForEdit(baseShortcut)).toEqual({ id: UUID, label: "F.C. København" });
  });
});

describe("deriveMostUsedFacets", () => {
  it("ranks club facets from owner jerseys", () => {
    expect(deriveMostUsedFacets("club", [baseJersey, baseJersey], [])).toEqual([
      { id: UUID, label: "F.C. København" },
    ]);
  });
});

describe("reorderShortcutIds", () => {
  it("moves a shortcut within the ordered id list", () => {
    const shortcuts = [
      { ...baseShortcut, id: "a" },
      { ...baseShortcut, id: "b" },
      { ...baseShortcut, id: "c" },
    ];

    expect(reorderShortcutIds(shortcuts, 0, 2)).toEqual(["b", "c", "a"]);
  });
});

describe("manageRowAccessibilityLabel", () => {
  it("includes match count in the row accessible name for Flyt manage rows", () => {
    expect(manageRowAccessibilityLabel("F.C. København", 3)).toBe("F.C. København, 3");
  });
});

describe("shouldResetToAlleAfterGem", () => {
  it("resets to Alle after Gem even when a non-Alle chip was active", () => {
    expect(shouldResetToAlleAfterGem()).toBe(true);
  });
});

describe("shouldResetShortcutAfterDelete", () => {
  it("resets Alle when the active genvej chip is deleted", () => {
    expect(shouldResetShortcutAfterDelete("shortcut-a", "shortcut-a")).toBe(true);
    expect(shouldResetShortcutAfterDelete("shortcut-a", "shortcut-b")).toBe(false);
    expect(shouldResetShortcutAfterDelete("shortcut-a", null)).toBe(false);
  });
});

describe("shouldFallbackToAlleOnFetchError", () => {
  it("falls back to Alle when filtered collection fetch 404s", () => {
    expect(shouldFallbackToAlleOnFetchError(404, UUID)).toBe(true);
    expect(shouldFallbackToAlleOnFetchError(404, null)).toBe(false);
    expect(shouldFallbackToAlleOnFetchError(500, UUID)).toBe(false);
  });
});
