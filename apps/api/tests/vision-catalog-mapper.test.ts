import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  catalogLabel,
  club,
  country,
  createDb,
  league,
  patch,
  player,
  playerClubSeason,
  resetDatabase,
  season,
  teamSeason,
} from "@kit/db";
import { beforeAll, describe, expect, it } from "vitest";
import { VisionCatalogMapper } from "../dist/vision/vision-catalog-mapper.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);
const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_api_test";

describe("VisionCatalogMapper", () => {
  beforeAll(async () => {
    await resetDatabase(DATABASE_URL, migrationsFolder);
  });

  it("maps player number and patch hints scoped to club season", async () => {
    const { db, pool } = createDb(DATABASE_URL);

    const [insertedCountry] = await db
      .insert(country)
      .values({ iso3166: "DK" })
      .returning({ id: country.id });
    const [insertedLeague] = await db
      .insert(league)
      .values({ countryId: insertedCountry!.id })
      .returning({ id: league.id });
    const [insertedClub] = await db
      .insert(club)
      .values({ countryId: insertedCountry!.id, kind: "club" })
      .returning({ id: club.id });
    await db.insert(catalogLabel).values({
      entityType: "club",
      entityId: insertedClub!.id,
      locale: "da",
      kind: "label",
      text: "FC Copenhagen",
      source: "seed",
    });
    const [insertedSeason] = await db
      .insert(season)
      .values({
        leagueId: insertedLeague!.id,
        label: "2023/24",
        startsOn: "2023-07-01",
        endsOn: "2024-06-30",
        calendarKind: "split_year",
      })
      .returning({ id: season.id });
    await db.insert(teamSeason).values({
      clubId: insertedClub!.id,
      seasonId: insertedSeason!.id,
    });

    const [insertedPlayer] = await db.insert(player).values({}).returning({ id: player.id });
    await db.insert(playerClubSeason).values({
      playerId: insertedPlayer!.id,
      clubId: insertedClub!.id,
      seasonId: insertedSeason!.id,
      squadNumber: 10,
    });
    await db.insert(catalogLabel).values({
      entityType: "player",
      entityId: insertedPlayer!.id,
      locale: "da",
      kind: "label",
      text: "Jonas Wind",
      source: "seed",
    });

    const [insertedPatch] = await db
      .insert(patch)
      .values({ seasonId: insertedSeason!.id, leagueId: insertedLeague!.id })
      .returning({ id: patch.id });
    await db.insert(catalogLabel).values({
      entityType: "patch",
      entityId: insertedPatch!.id,
      locale: "da",
      kind: "label",
      text: "Superligaen",
      source: "seed",
    });

    await pool.end();

    const { db: mapperDb, pool: mapperPool } = createDb(DATABASE_URL);
    const mapper = new VisionCatalogMapper(mapperDb);
    const mapped = await mapper.mapHints({
      clubHint: "FC Copenhagen",
      seasonHint: "2023/24",
      playerNumberHint: "10",
      patchHint: "Superliga",
      confidence: 0.8,
    });
    await mapperPool.end();

    expect(mapped?.playerId).toBe(insertedPlayer!.id);
    expect(mapped?.playerNumber).toBe("10");
    expect(mapped?.patchId).toBe(insertedPatch!.id);
  });
});
