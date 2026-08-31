import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  catalogLabel,
  club,
  createDb,
  externalId,
  league,
  player,
  playerClubSeason,
  resetDatabase,
  season,
  teamSeason,
} from "@kit/db";
import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createFixtureFetchAdapter } from "../src/fetch/fixture-adapter.js";
import { createKaderFetchAdapter } from "../src/fetch/kader-fetch-adapter.js";
import { normalize } from "../src/normalize/index.js";
import { parseCliArgs, runHierarchyGrain } from "../src/run.js";
import { TM_SYSTEM } from "../src/types.js";
import { resolveSeedApifyTestDatabaseUrl } from "./test-database-url.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/superliga-mini.json",
);

const kaderFixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/kader-html",
);

const TEST_DATABASE_URL = resolveSeedApifyTestDatabaseUrl();

async function prepareDatabase() {
  await resetDatabase(TEST_DATABASE_URL, migrationsFolder);
}

describe("Hierarchy grain — League", () => {
  beforeAll(async () => {
    await prepareDatabase();
  });

  it("writes League, CatalogLabel, and ExternalId without seasons or clubs", async () => {
    const adapter = createFixtureFetchAdapter(fixturePath);
    const { summary } = await runHierarchyGrain({
      kind: "league",
      competition: "dk1",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    expect(summary.leagues).toBe(1);
    expect(summary.catalogLabels).toBeGreaterThanOrEqual(1);
    expect(summary.externalIds).toBeGreaterThanOrEqual(1);
    expect(summary.seasons).toBe(0);
    expect(summary.clubs).toBe(0);
    expect(summary.teamSeasons).toBe(0);
    expect(summary.players).toBe(0);

    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const leagues = await db.select({ id: league.id }).from(league);
      expect(leagues).toHaveLength(1);

      const labels = await db
        .select({ text: catalogLabel.text })
        .from(catalogLabel)
        .where(and(eq(catalogLabel.entityType, "league"), eq(catalogLabel.kind, "label")));
      expect(labels.map((row) => row.text)).toContain("Superligaen");

      const ids = await db
        .select({ value: externalId.value })
        .from(externalId)
        .where(and(eq(externalId.system, TM_SYSTEM), eq(externalId.entityType, "league")));
      expect(ids.map((row) => row.value)).toContain("dk1");

      const seasonCount = await db.select({ n: sql<number>`count(*)::int` }).from(season);
      expect(seasonCount[0]?.n).toBe(0);
      const clubCount = await db.select({ n: sql<number>`count(*)::int` }).from(club);
      expect(clubCount[0]?.n).toBe(0);
    } finally {
      await pool.end();
    }
  });

  it("second League grain run is idempotent on ExternalId", async () => {
    await prepareDatabase();
    const adapter = createFixtureFetchAdapter(fixturePath);
    const first = await runHierarchyGrain({
      kind: "league",
      competition: "dk1",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
    });
    const second = await runHierarchyGrain({
      kind: "league",
      competition: "dk1",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    expect(first.summary.leagues).toBe(1);
    expect(second.summary.leagues).toBe(0);

    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const leagues = await db.select({ id: league.id }).from(league);
      expect(leagues).toHaveLength(1);
    } finally {
      await pool.end();
    }
  });
});

describe("Hierarchy grain — lane guard", () => {
  it("rejects production lane without touching the database", async () => {
    await expect(
      runHierarchyGrain({
        kind: "league",
        competition: "dk1",
        lane: "production" as "development",
        fetchAdapter: createFixtureFetchAdapter(fixturePath),
        databaseUrl: TEST_DATABASE_URL,
      }),
    ).rejects.toThrow(/production/i);
  });
});

describe("Hierarchy grain — League season", () => {
  beforeAll(async () => {
    await prepareDatabase();
  });

  it("writes Season and source-driven club list without player/PCS rows", async () => {
    const adapter = createFixtureFetchAdapter(fixturePath);
    const { summary } = await runHierarchyGrain({
      kind: "league_season",
      competition: "dk1",
      season: "23/24",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    expect(summary.leagues).toBe(1);
    expect(summary.seasons).toBe(1);
    expect(summary.clubs).toBe(2);
    expect(summary.teamSeasons).toBe(2);
    expect(summary.players).toBe(0);
    expect(summary.playerClubSeasons).toBe(0);

    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const seasons = await db
        .select({ label: season.label })
        .from(season)
        .where(eq(season.label, "23/24"));
      expect(seasons).toHaveLength(1);

      const clubIds = await db
        .select({ value: externalId.value })
        .from(externalId)
        .where(and(eq(externalId.system, TM_SYSTEM), eq(externalId.entityType, "club")));
      expect(clubIds.map((row) => row.value).sort()).toEqual(["club-190", "club-191"]);

      const tsCount = await db.select({ n: sql<number>`count(*)::int` }).from(teamSeason);
      expect(tsCount[0]?.n).toBe(2);

      const playerCount = await db.select({ n: sql<number>`count(*)::int` }).from(player);
      expect(playerCount[0]?.n).toBe(0);
      const pcsCount = await db.select({ n: sql<number>`count(*)::int` }).from(playerClubSeason);
      expect(pcsCount[0]?.n).toBe(0);
    } finally {
      await pool.end();
    }
  });

  it("uses competition season page club list (kader HTML fixture)", async () => {
    await prepareDatabase();
    const adapter = createKaderFetchAdapter({ fixturesDir: kaderFixturesDir });
    const { summary } = await runHierarchyGrain({
      kind: "league_season",
      competition: "dk1",
      season: "2015/16",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    expect(summary.clubs).toBe(2);
    expect(summary.teamSeasons).toBe(2);
    expect(summary.players).toBe(0);

    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const clubIds = await db
        .select({ value: externalId.value })
        .from(externalId)
        .where(and(eq(externalId.system, TM_SYSTEM), eq(externalId.entityType, "club")));
      expect(clubIds.map((row) => row.value).sort()).toEqual(["190", "191"]);
    } finally {
      await pool.end();
    }
  });
});

describe("Hierarchy grain — League season normalize", () => {
  it("strips market value and branding before League season map", async () => {
    const adapter = createFixtureFetchAdapter(fixturePath);
    const raw = await adapter.fetchLeagueSeason({ competition: "dk1", season: "23/24" });
    expect(raw.seasons[0]?.clubs[0]?.marketValue).toBeDefined();
    expect(raw.seasons[0]?.clubs[0]?.players).toEqual([]);

    const facts = normalize(raw);
    expect(facts.seasons[0]?.clubs[0]).not.toHaveProperty("marketValue");
    expect(facts.seasons[0]?.clubs[0]?.players).toEqual([]);
    expect(facts.seasons[0]?.clubs).toHaveLength(2);
  });
});

describe("Hierarchy grain CLI", () => {
  it("parses grain league and defaults lane to development", () => {
    const parsed = parseCliArgs(["node", "seed-apify", "grain", "league", "dk1"]);
    expect(parsed).toEqual({
      mode: "grain",
      grain: { kind: "league", competition: "dk1" },
      lane: "development",
    });
  });

  it("parses grain league-season with season and staging", () => {
    const parsed = parseCliArgs([
      "node",
      "seed-apify",
      "grain",
      "league-season",
      "dk1",
      "2010/11",
      "staging",
    ]);
    expect(parsed).toEqual({
      mode: "grain",
      grain: { kind: "league_season", competition: "dk1", season: "2010/11" },
      lane: "staging",
    });
  });

  it("rejects production on grain CLI", () => {
    expect(() =>
      parseCliArgs(["node", "seed-apify", "grain", "league", "dk1", "production"]),
    ).toThrow(/production/i);
  });
});
