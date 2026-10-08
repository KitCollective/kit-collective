import { readFileSync } from "node:fs";
import { join } from "node:path";
import { omitDevCatalogFixtureRows } from "@kit/api-contract";
import { describe, expect, it } from "vitest";
import {
  CATALOG_SEARCH_ERROR_MESSAGE,
  pickerRowSquadNumber,
  resolveClubPickerRows,
  resolvePlayerPickerRows,
  resolveSeasonPickerRows,
} from "../src/catalog/liveCatalogPicker";

const FIXTURE_FCK_ID = "11111111-1111-4111-8111-111111111111";
const LIVE_CLUB_ID = "550e8400-e29b-41d4-a716-446655440000";
const LIVE_PLAYER_ID = "660e8400-e29b-41d4-a716-446655440001";
const LIVE_SEASON_ID = "770e8400-e29b-41d4-a716-446655440002";

const clubPickerPath = join(__dirname, "../src/components/club-picker-overlay.tsx");
const playerPickerPath = join(__dirname, "../src/components/player-picker-overlay.tsx");
const seasonPickerPath = join(__dirname, "../src/components/season-picker-overlay.tsx");
const dataScreenPath = join(__dirname, "../src/components/confirm-data-screen.tsx");
const facetPickerPath = join(__dirname, "../src/components/facet-picker-overlay.tsx");

describe("live catalog picker isolation", () => {
  it("drops seed fixture clubs from live hits so scraped stamdata is not duplicated", () => {
    const live = [
      {
        id: FIXTURE_FCK_ID,
        label: "F.C. København",
        kind: "club" as const,
      },
      {
        id: LIVE_CLUB_ID,
        label: "F.C. København",
        kind: "club" as const,
      },
    ];

    const resolved = resolveClubPickerRows({
      authenticated: true,
      live,
      liveFailed: false,
    });

    expect(resolved.items).toEqual([
      {
        id: LIVE_CLUB_ID,
        label: "F.C. København",
        kind: "club",
      },
    ]);
    expect(omitDevCatalogFixtureRows(live).map((row) => row.id)).toEqual([LIVE_CLUB_ID]);
  });

  it("shows an error with no fixture rows when live search fails", () => {
    const resolved = resolveClubPickerRows({
      authenticated: true,
      live: null,
      liveFailed: true,
    });

    expect(resolved.errorMessage).toBe(CATALOG_SEARCH_ERROR_MESSAGE);
    expect(resolved.items).toEqual([]);
  });

  it("does not invent clubs when unauthenticated", () => {
    const resolved = resolveClubPickerRows({
      authenticated: false,
      live: null,
      liveFailed: false,
    });

    expect(resolved.errorMessage).toBeNull();
    expect(resolved.items).toEqual([]);
  });

  it("does not fall back to fixture players when live squad search fails", () => {
    const liveFail = resolvePlayerPickerRows({
      clubId: LIVE_CLUB_ID,
      live: null,
      liveFailed: true,
    });
    expect(liveFail.items).toEqual([]);
    expect(liveFail.errorMessage).toBe(CATALOG_SEARCH_ERROR_MESSAGE);
  });

  it("keeps live squad rows and strips fixture player IDs", () => {
    const live = [
      {
        id: "b1111111-b111-4111-8111-111111111111",
        label: "Rasmus Falk",
        meta: "Nr. 33",
      },
      {
        id: LIVE_PLAYER_ID,
        label: "Jonas Wind",
        meta: "Nr. 23",
      },
    ];
    const resolved = resolvePlayerPickerRows({
      clubId: LIVE_CLUB_ID,
      live,
      liveFailed: false,
    });

    expect(resolved.items).toEqual([
      {
        id: LIVE_PLAYER_ID,
        label: "Jonas Wind",
        meta: "Nr. 23",
      },
    ]);
    expect(pickerRowSquadNumber(resolved.items[0]!)).toBe("23");
  });

  it("maps live seasons without a fixture fallback", () => {
    expect(resolveSeasonPickerRows({})).toEqual([]);
    expect(resolveSeasonPickerRows({ liveSeasons: [] })).toEqual([]);
    expect(
      resolveSeasonPickerRows({
        liveSeasons: [
          { id: "aaaaaaa1-aaa1-4aa1-8aa1-111111111111", label: "2024/25" },
          { id: LIVE_SEASON_ID, label: "2010/11" },
        ],
      }),
    ).toEqual([{ id: LIVE_SEASON_ID, label: "2010/11" }]);
  });

  it("wires Confirm pickers and Genveje player search to the live catalog helpers", () => {
    const clubPicker = readFileSync(clubPickerPath, "utf8");
    const playerPicker = readFileSync(playerPickerPath, "utf8");
    const seasonPicker = readFileSync(seasonPickerPath, "utf8");
    const dataScreen = readFileSync(dataScreenPath, "utf8");
    const facetPicker = readFileSync(facetPickerPath, "utf8");

    expect(clubPicker).toContain("resolveClubPickerRows");
    expect(clubPicker).not.toContain("trimmed.length < 2");
    expect(clubPicker).not.toContain("dummyCatalog");
    expect(clubPicker).not.toContain("searchDummyClubs");
    expect(clubPicker).toContain("CATALOG_SEARCH_ERROR_MESSAGE");

    expect(playerPicker).toContain("searchCatalogPlayers");
    expect(playerPicker).not.toContain("dummyCatalog");
    expect(playerPicker).toContain("CATALOG_SEARCH_ERROR_MESSAGE");

    expect(seasonPicker).toContain("resolveSeasonPickerRows");
    expect(seasonPicker).not.toContain("dummyCatalog");

    expect(dataScreen).toContain("fetchClubSeasons");
    expect(dataScreen).toContain("fetchSeasonPatches");
    expect(dataScreen).not.toContain("dummyCatalog");
    expect(dataScreen).toContain("accessToken={accessToken}");

    expect(facetPicker).toContain("searchCatalogPlayers");
  });
});
