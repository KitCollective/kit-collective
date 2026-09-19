import { describe, expect, it } from "vitest";
import {
  dummyBadgesForSeason,
  dummyPlayersForClub,
  dummySeasonsForClub,
  searchDummyClubs,
} from "../src/catalog/dummyCatalog";

const FCK_ID = "11111111-1111-4111-8111-111111111111";

describe("dummy catalog fixture", () => {
  it("returns clubs with a country meta and matches label or country", () => {
    const all = searchDummyClubs("");
    expect(all.length).toBeGreaterThanOrEqual(6);
    expect(all[0]).toEqual(
      expect.objectContaining({
        label: "F.C. København",
        meta: "Danmark",
      }),
    );

    expect(searchDummyClubs("barcelona").map((row) => row.label)).toEqual(["FC Barcelona"]);
    expect(searchDummyClubs("england").every((row) => row.meta === "England")).toBe(true);
  });

  it("scopes seasons and numbered players to a club", () => {
    const seasons = dummySeasonsForClub(FCK_ID);
    expect(seasons.map((row) => row.label)).toEqual(["2024/25", "2023/24", "2022/23"]);

    const seasonId = seasons[0]?.id ?? "";
    const players = dummyPlayersForClub(FCK_ID, seasonId, "");
    expect(
      players.some((row) => row.label === "Mohamed Elyounoussi" && row.meta === "Nr. 10"),
    ).toBe(true);

    const older = dummyPlayersForClub(FCK_ID, seasons[2]?.id ?? "", "");
    expect(older.map((row) => row.label)).toEqual(["Rasmus Falk"]);
  });

  it("returns domestic league and Champions League badges for a club season", () => {
    const seasons = dummySeasonsForClub(FCK_ID);
    const badges = dummyBadgesForSeason(FCK_ID, seasons[0]?.id ?? "");
    expect(badges.map((row) => row.label)).toEqual(["Superligaen", "Champions League"]);
    expect(dummyBadgesForSeason(FCK_ID, null)).toEqual([]);
  });
});
