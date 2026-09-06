import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  club,
  createDb,
  externalId,
  playerClubSeason,
  playerNationalTeamSeason,
  resetDatabase,
  season,
  teamSeason,
} from "@kit/db";
import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createKaderFetchAdapter } from "../src/fetch/kader-fetch-adapter.js";
import { runClubJoinWorkflow, runNationalTeamJoinWorkflow, type FkJoinRunner } from "../src/join-workflow.js";
import { parseCliArgs } from "../src/run.js";
import { TM_SYSTEM } from "../src/types.js";
import { resolveSeedApifyTestDatabaseUrl } from "./test-database-url.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const kaderFixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/kader-html",
);

const TEST_DATABASE_URL = resolveSeedApifyTestDatabaseUrl();

async function prepareDatabase() {
  await resetDatabase(TEST_DATABASE_URL, migrationsFolder);
}

describe("Join workflow CLI", () => {
  it("parses join club path", () => {
    expect(parseCliArgs(["node", "seed-apify", "join", "club", "dk1", "2010/11"])).toEqual({
      mode: "join",
      scope: {
        path: "club",
        competition: "dk1",
        season: "2010/11",
        lane: "development",
      },
    });
  });

  it("parses join national-team path", () => {
    expect(parseCliArgs(["node", "seed-apify", "join", "national-team", "3436", "2010"])).toEqual({
      mode: "join",
      scope: {
        path: "national_team",
        nationalTeamRef: "3436",
        season: "2010",
        lane: "development",
      },
    });
  });

  it("parses join sentence subcommand", () => {
    const parsed = parseCliArgs([
      "node",
      "seed-apify",
      "join",
      "sentence",
      "Seed Superliga 2010/11 including every club, squads, and kits into development.",
    ]);
    expect(parsed).toEqual({
      mode: "join",
      scope: {
        path: "club",
        competition: "superliga",
        season: "2010/11",
        lane: "development",
      },
    });
  });
});

describe("Join workflow — Club path Superliga 2010/11", () => {
  beforeAll(async () => {
    await prepareDatabase();
  });

  it("composes league through FK kits for every club on the competition page", async () => {
    const adapter = createKaderFetchAdapter({ fixturesDir: kaderFixturesDir });
    const fkRunner: FkJoinRunner = vi.fn(async () => ({ kitsUpserted: 3, photosWritten: 3 }));

    const summary = await runClubJoinWorkflow({
      path: "club",
      competition: "dk1",
      season: "2010/11",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
      fkRunner,
    });

    expect(summary.path).toBe("club");
    expect(summary.apify.leagues).toBeGreaterThanOrEqual(1);
    expect(summary.apify.seasons).toBeGreaterThanOrEqual(1);
    expect(summary.apify.clubs).toBe(2);
    expect(summary.clubSeasonsFetched).toBe(2);
    expect(summary.clubSeasonsSkipped).toBe(0);
    expect(fkRunner).toHaveBeenCalledOnce();
    expect(vi.mocked(fkRunner).mock.calls[0]?.[0]?.scope).toEqual({
      kind: "competition",
      competition: "dk1",
      fromSeason: "2010/11",
      toSeason: "2010/11",
    });

    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const clubIds = await db
        .select({ value: externalId.value })
        .from(externalId)
        .where(and(eq(externalId.system, TM_SYSTEM), eq(externalId.entityType, "club")));
      expect(clubIds.map((row) => row.value).sort()).toEqual(["190", "191"]);

      const squadRows = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(playerClubSeason)
        .where(sql`${playerClubSeason.squadNumber} is not null`);
      expect(squadRows[0]?.n).toBeGreaterThan(0);

      const teamSeasonRows = await db.select({ n: sql<number>`count(*)::int` }).from(teamSeason);
      expect(teamSeasonRows[0]?.n).toBe(2);
    } finally {
      await pool.end();
    }
  });

});

describe("Join workflow — Club path idempotency", () => {
  beforeAll(async () => {
    await prepareDatabase();
  });

  it("skips already-seeded club seasons on a second Join run", async () => {
    const adapter = createKaderFetchAdapter({ fixturesDir: kaderFixturesDir });
    const fkRunner: FkJoinRunner = vi.fn(async () => ({ kitsUpserted: 0, photosWritten: 0 }));

    const first = await runClubJoinWorkflow({
      path: "club",
      competition: "dk1",
      season: "2010/11",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
      fkRunner,
    });
    expect(first.clubSeasonsFetched).toBe(2);

    const second = await runClubJoinWorkflow({
      path: "club",
      competition: "dk1",
      season: "2010/11",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
      fkRunner,
    });
    expect(second.clubSeasonsSkipped).toBe(2);
    expect(second.clubSeasonsFetched).toBe(0);
    expect(second.apify.clubs).toBe(0);
  });
});

describe("Join workflow — NationalTeam path Denmark WC 2010", () => {
  beforeAll(async () => {
    await prepareDatabase();
  });

  it("composes national team through FK kits", async () => {
    const adapter = createKaderFetchAdapter({ fixturesDir: kaderFixturesDir });
    const fkRunner: FkJoinRunner = vi.fn(async () => ({ kitsUpserted: 4, photosWritten: 4 }));

    const summary = await runNationalTeamJoinWorkflow({
      path: "national_team",
      nationalTeamRef: "3436",
      season: "2010",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
      fkRunner,
      portraitStore: { async putObject() {} },
    });

    expect(summary.path).toBe("national_team");
    expect(summary.apify.nationalTeams).toBe(1);
    expect(summary.apify.nationalTeamSeasons).toBe(1);
    expect(summary.apify.playerNationalTeamSeasons).toBe(2);
    expect(summary.nationalTeamSeasonSkipped).toBe(false);
    expect(fkRunner).toHaveBeenCalledOnce();
    expect(vi.mocked(fkRunner).mock.calls[0]?.[0]?.scope).toEqual({
      kind: "national_team",
      nationalTeamRef: "3436",
      season: "2010",
    });

    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const clubCount = await db.select({ n: sql<number>`count(*)::int` }).from(club);
      expect(clubCount[0]?.n).toBe(0);

      const ntRows = await db
        .select({ value: externalId.value })
        .from(externalId)
        .where(
          and(eq(externalId.system, TM_SYSTEM), eq(externalId.entityType, "national_team")),
        );
      expect(ntRows.map((row) => row.value)).toEqual(["3436"]);

      const squadRows = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(playerNationalTeamSeason)
        .where(sql`${playerNationalTeamSeason.squadNumber} is not null`);
      expect(squadRows[0]?.n).toBe(2);

      const seasons = await db
        .select({ label: season.label, leagueId: season.leagueId })
        .from(season)
        .where(eq(season.label, "2010"));
      expect(seasons[0]).toMatchObject({ label: "2010", leagueId: null });
    } finally {
      await pool.end();
    }
  });

});

describe("Join workflow — NationalTeam path idempotency", () => {
  beforeAll(async () => {
    await prepareDatabase();
  });

  it("skips national team season when already seeded", async () => {
    const adapter = createKaderFetchAdapter({ fixturesDir: kaderFixturesDir });
    const fkRunner: FkJoinRunner = vi.fn(async () => ({ kitsUpserted: 0, photosWritten: 0 }));

    await runNationalTeamJoinWorkflow({
      path: "national_team",
      nationalTeamRef: "3436",
      season: "2010",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
      fkRunner,
      portraitStore: { async putObject() {} },
    });

    const second = await runNationalTeamJoinWorkflow({
      path: "national_team",
      nationalTeamRef: "3436",
      season: "2010",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
      fkRunner,
      portraitStore: { async putObject() {} },
    });

    expect(second.nationalTeamSeasonSkipped).toBe(true);
    expect(second.apify.nationalTeamSeasons).toBe(0);
    expect(second.apify.playerNationalTeamSeasons).toBe(0);
  });
});
