import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  club,
  createDb,
  externalId,
  kit,
  kitPhoto,
  playerClubSeason,
  playerNationalTeamSeason,
  resetDatabase,
  season,
  teamSeason,
} from "@kit/db";
import {
  createJoinProofClubFixtureFetchAdapter,
  createJoinProofNationalTeamFixtureFetchAdapter,
} from "@kit/seed-fkapi/fetch";
import { runFkSeed } from "@kit/seed-fkapi/mapper";
import type { ObjectStoreAdapter } from "@kit/seed-fkapi/types";
import { and, eq, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createKaderFetchAdapter } from "../src/fetch/kader-fetch-adapter.js";
import { resolveDefaultFkFetchAdapter } from "../src/fk-runner.js";
import {
  type FkJoinRunner,
  runClubJoinWorkflow,
  runNationalTeamJoinWorkflow,
} from "../src/join-workflow.js";
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

function createMemoryObjectStore(): ObjectStoreAdapter & { objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async putObject(key: string, bytes: Uint8Array): Promise<void> {
      objects.set(key, bytes);
    },
    async objectExists(key: string): Promise<boolean> {
      return objects.has(key);
    },
  };
}

function createJoinClubFkRunner(objectStore: ObjectStoreAdapter): FkJoinRunner {
  const fetchAdapter = createJoinProofClubFixtureFetchAdapter();
  return async ({ scope, databaseUrl }) =>
    runFkSeed({ databaseUrl, fetchAdapter, objectStore, scope });
}

function createJoinNationalTeamFkRunner(objectStore: ObjectStoreAdapter): FkJoinRunner {
  const fetchAdapter = createJoinProofNationalTeamFixtureFetchAdapter();
  return async ({ scope, databaseUrl }) =>
    runFkSeed({ databaseUrl, fetchAdapter, objectStore, scope });
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
        .where(and(eq(externalId.system, TM_SYSTEM), eq(externalId.entityType, "national_team")));
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

describe("Join workflow — FK integration", () => {
  it("requires FKAPI_BASE_URL for CLI FK fetch (no silent fixture default)", () => {
    const previous = process.env.FKAPI_BASE_URL;
    delete process.env.FKAPI_BASE_URL;
    try {
      expect(() => resolveDefaultFkFetchAdapter()).toThrow(/FKAPI_BASE_URL/);
    } finally {
      if (previous !== undefined) {
        process.env.FKAPI_BASE_URL = previous;
      }
    }
  });

  beforeEach(async () => {
    await prepareDatabase();
  });

  it("writes kit and kit_photo rows for Superliga 2010/11 club join", async () => {
    const adapter = createKaderFetchAdapter({ fixturesDir: kaderFixturesDir });
    const objectStore = createMemoryObjectStore();
    const summary = await runClubJoinWorkflow({
      path: "club",
      competition: "dk1",
      season: "2010/11",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
      fkRunner: createJoinClubFkRunner(objectStore),
    });

    expect(summary.fk.kitsUpserted).toBeGreaterThan(0);
    expect(summary.fk.photosWritten).toBeGreaterThan(0);
    expect(objectStore.objects.size).toBeGreaterThan(0);

    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const kitRows = await db.select({ id: kit.id, clubId: kit.clubId }).from(kit);
      expect(kitRows.length).toBeGreaterThan(0);
      expect(kitRows.every((row) => row.clubId !== null)).toBe(true);

      const photos = await db
        .select({
          objectKey: kitPhoto.objectKey,
          rights: kitPhoto.rights,
          visibility: kitPhoto.visibility,
        })
        .from(kitPhoto);
      expect(photos.length).toBeGreaterThan(0);
      expect(photos.every((row) => row.rights === "unresolved")).toBe(true);
      expect(photos.every((row) => row.visibility === "admin_only")).toBe(true);
    } finally {
      await pool.end();
    }
  });

  it("writes kit and kit_photo rows for Denmark WC 2010 national team join", async () => {
    const adapter = createKaderFetchAdapter({ fixturesDir: kaderFixturesDir });
    const objectStore = createMemoryObjectStore();
    const summary = await runNationalTeamJoinWorkflow({
      path: "national_team",
      nationalTeamRef: "3436",
      season: "2010",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
      fkRunner: createJoinNationalTeamFkRunner(objectStore),
      portraitStore: { async putObject() {} },
    });

    expect(summary.fk.kitsUpserted).toBe(3);
    expect(summary.fk.photosWritten).toBe(3);

    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const kitRows = await db
        .select({ nationalTeamId: kit.nationalTeamId, clubId: kit.clubId })
        .from(kit);
      expect(kitRows).toHaveLength(3);
      expect(kitRows.every((row) => row.nationalTeamId !== null && row.clubId === null)).toBe(true);
      const photos = await db.select({ id: kitPhoto.id }).from(kitPhoto);
      expect(photos).toHaveLength(3);
    } finally {
      await pool.end();
    }
  });
});
