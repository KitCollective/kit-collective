import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  catalogLabel,
  club,
  createDb,
  player,
  playerClubSeason,
  SEED_CREATE_DB_OPTIONS,
  season,
  seedDevCatalog,
  teamSeason,
} from "../src/index.js";
import { resetDatabase } from "../src/migrate.js";
import { resolveKitDbTestDatabaseUrl } from "./test-database-url.js";

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

const DATABASE_URL = resolveKitDbTestDatabaseUrl();

/** Same UUIDs as apps/mobile/src/catalog/dummyCatalog.ts — independent of the seed module. */
const FCK_ID = "11111111-1111-4111-8111-111111111111";
const FCK_SEASON_2425 = "aaaaaaa1-aaa1-4aa1-8aa1-111111111111";
const FALK_ID = "b1111111-b111-4111-8111-111111111111";

describe("dev catalog fixture", () => {
  beforeAll(async () => {
    await resetDatabase(DATABASE_URL, migrationsFolder);
  });

  afterAll(async () => {
    const { pool } = createDb(DATABASE_URL, SEED_CREATE_DB_OPTIONS);
    await pool.end();
  });

  it("upserts Confirm picker clubs, seasons, and players so Save can link TeamSeason", async () => {
    const { db, pool } = createDb(DATABASE_URL, SEED_CREATE_DB_OPTIONS);

    const first = await seedDevCatalog(db);
    const second = await seedDevCatalog(db);

    const clubs = await db.select({ id: club.id }).from(club).where(eq(club.id, FCK_ID));
    const labels = await db
      .select({ text: catalogLabel.text, kind: catalogLabel.kind, locale: catalogLabel.locale })
      .from(catalogLabel)
      .where(and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.entityId, FCK_ID)));
    const seasons = await db
      .select({ id: season.id, label: season.label })
      .from(season)
      .where(eq(season.id, FCK_SEASON_2425));
    const links = await db
      .select({ id: teamSeason.id })
      .from(teamSeason)
      .where(and(eq(teamSeason.clubId, FCK_ID), eq(teamSeason.seasonId, FCK_SEASON_2425)));
    const players = await db.select({ id: player.id }).from(player).where(eq(player.id, FALK_ID));
    const squad = await db
      .select({ squadNumber: playerClubSeason.squadNumber })
      .from(playerClubSeason)
      .where(
        and(
          eq(playerClubSeason.playerId, FALK_ID),
          eq(playerClubSeason.clubId, FCK_ID),
          eq(playerClubSeason.seasonId, FCK_SEASON_2425),
        ),
      );

    await pool.end();

    expect(first.clubs).toBeGreaterThanOrEqual(6);
    expect(second.clubs).toBe(first.clubs);
    expect(clubs).toHaveLength(1);
    expect(labels).toEqual(
      expect.arrayContaining([
        { text: "F.C. København", kind: "label", locale: "da" },
        { text: "F.C. Copenhagen", kind: "label", locale: "en" },
        { text: "FCK", kind: "alias", locale: "da" },
        { text: "Danmark", kind: "alias", locale: "da" },
      ]),
    );
    expect(seasons).toEqual([{ id: FCK_SEASON_2425, label: "2024/25" }]);
    expect(links).toHaveLength(1);
    expect(players).toHaveLength(1);
    expect(squad).toEqual([{ squadNumber: 33 }]);
  });
});
