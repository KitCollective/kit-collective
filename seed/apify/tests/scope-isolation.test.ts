import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, playerClubSeason, resetDatabase, season } from "@kit/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { FetchAdapter } from "../src/fetch/adapter.js";
import { createFixtureFetchAdapter } from "../src/fetch/fixture-adapter.js";
import { createRecordingFetchAdapter } from "../src/fetch/recording-adapter.js";
import { mapFacts } from "../src/map/index.js";
import { normalize } from "../src/normalize/index.js";
import { runSeed } from "../src/run.js";
import {
  assertOutOfScopeSeasonsUnchanged,
  assertPairsInScope,
  resolveScopeSeasonLabels,
  SeedScopeIsolationError,
  snapshotSeasonPcsByLabel,
} from "../src/scope-isolation.js";
import { resolveSeedApifyTestDatabaseUrl } from "./test-database-url.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/superliga-mini.json",
);

const TEST_DATABASE_URL = resolveSeedApifyTestDatabaseUrl();

let dbResetChain: Promise<void> = Promise.resolve();

async function prepareDatabase() {
  dbResetChain = dbResetChain.then(async () => {
    await resetDatabase(TEST_DATABASE_URL, migrationsFolder);
  });
  await dbResetChain;
}

async function countPcsForSeasonLabel(
  db: ReturnType<typeof createDb>["db"],
  label: string,
): Promise<number> {
  const rows = await db
    .select({ id: playerClubSeason.id })
    .from(playerClubSeason)
    .innerJoin(season, eq(playerClubSeason.seasonId, season.id))
    .where(eq(season.label, label));
  return rows.length;
}

describe("resolveScopeSeasonLabels", () => {
  it("resolves a single competition season", () => {
    expect(
      resolveScopeSeasonLabels({
        kind: "competition",
        competition: "superligaen",
        fromSeason: "2017/18",
        toSeason: "2017/18",
      }),
    ).toEqual(new Set(["2017/18"]));
  });

  it("resolves bare start years to split-year labels", () => {
    expect(
      resolveScopeSeasonLabels({
        kind: "competition",
        competition: "superligaen",
        fromSeason: "2015",
        toSeason: "2015",
      }),
    ).toEqual(new Set(["2015/16"]));
  });

  it("resolves 0001 shorthand to the competition first season", () => {
    expect(
      resolveScopeSeasonLabels({
        kind: "competition",
        competition: "superligaen",
        fromSeason: "0001",
        toSeason: "0001",
      }),
    ).toEqual(new Set(["1991/92"]));
  });
});

describe("assertPairsInScope", () => {
  it("rejects pairs outside the requested season range", () => {
    expect(() =>
      assertPairsInScope(
        [{ clubExternalId: "club-190", seasonLabel: "2016/17" }],
        new Set(["2017/18"]),
      ),
    ).toThrow(SeedScopeIsolationError);
  });
});

describe("runSeed scope isolation", () => {
  it("does not mutate PlayerClubSeason rows for seasons outside the requested scope", async () => {
    await prepareDatabase();
    const inner = createFixtureFetchAdapter(fixturePath);
    const recording = createRecordingFetchAdapter(inner);

    await runSeed({
      scope: {
        kind: "club",
        competition: "dk1",
        clubExternalId: "club-190",
        season: "22/23",
      },
      lane: "development",
      fetchAdapter: recording.adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    const { db, pool } = createDb(TEST_DATABASE_URL);
    const before22 = await countPcsForSeasonLabel(db, "22/23");

    const result = await runSeed({
      scope: {
        kind: "competition",
        competition: "dk1",
        fromSeason: "23/24",
        toSeason: "23/24",
      },
      lane: "development",
      fetchAdapter: recording.adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    expect(result.summary.fetched).toBe(2);
    const after22 = await countPcsForSeasonLabel(db, "22/23");
    expect(after22).toBe(before22);
    await pool.end();
  }, 60_000);

  it("leaves out-of-scope seasons unchanged on a second all-skipped competition run", async () => {
    await prepareDatabase();
    const inner = createFixtureFetchAdapter(fixturePath);
    const recording = createRecordingFetchAdapter(inner);

    const scope = {
      kind: "competition" as const,
      competition: "dk1",
      fromSeason: "23/24",
      toSeason: "23/24",
    };

    await runSeed({
      scope,
      lane: "development",
      fetchAdapter: recording.adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    const { db: dbBefore, pool: poolBefore } = createDb(TEST_DATABASE_URL);
    const snapshotBefore = await snapshotSeasonPcsByLabel(dbBefore, "dk1");
    await poolBefore.end();

    const fetchCallsAfterFirst = recording.getFetchCalls().length;

    const second = await runSeed({
      scope,
      lane: "development",
      fetchAdapter: recording.adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    expect(second.summary.fetched).toBe(0);
    expect(second.summary.skipped).toBe(2);
    expect(recording.getFetchCalls()).toHaveLength(fetchCallsAfterFirst);

    const { db: dbAfter, pool: poolAfter } = createDb(TEST_DATABASE_URL);
    const snapshotAfter = await snapshotSeasonPcsByLabel(dbAfter, "dk1");
    await poolAfter.end();

    assertOutOfScopeSeasonsUnchanged(
      snapshotBefore,
      snapshotAfter,
      resolveScopeSeasonLabels(scope),
    );
  }, 60_000);

  it("fails when mapped facts target a season outside the club-season pair", async () => {
    await prepareDatabase();
    const inner = createFixtureFetchAdapter(fixturePath);
    const evilAdapter: FetchAdapter = {
      listClubSeasonPairs: inner.listClubSeasonPairs.bind(inner),
      async fetchClubSeason(params) {
        const raw = await inner.fetchClubSeason(params);
        const firstSeason = raw.seasons[0];
        if (!firstSeason) {
          throw new Error("missing season");
        }
        return {
          ...raw,
          seasons: [{ ...firstSeason, label: "22/23" }],
        };
      },
    };

    await expect(
      runSeed({
        scope: {
          kind: "club",
          competition: "dk1",
          clubExternalId: "club-190",
          season: "23/24",
        },
        lane: "development",
        fetchAdapter: evilAdapter,
        databaseUrl: TEST_DATABASE_URL,
      }),
    ).rejects.toThrow(SeedScopeIsolationError);
  }, 60_000);

  it("mapFacts rejects normalized facts outside allowed season labels", async () => {
    await prepareDatabase();
    const inner = createFixtureFetchAdapter(fixturePath);
    const raw = await inner.fetchClubSeason({
      competition: "dk1",
      clubExternalId: "club-190",
      season: "23/24",
    });
    const facts = normalize(raw);

    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      await expect(
        mapFacts(db, facts, { allowedSeasonLabels: new Set(["22/23"]) }),
      ).rejects.toThrow(SeedScopeIsolationError);
    } finally {
      await pool.end();
    }
  }, 60_000);
});
