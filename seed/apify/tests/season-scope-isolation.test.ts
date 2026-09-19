import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, playerClubSeason, resetDatabase, season } from "@kit/db";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { FetchAdapter } from "../src/fetch/adapter.js";
import { createFixtureFetchAdapter } from "../src/fetch/fixture-adapter.js";
import { createRecordingFetchAdapter } from "../src/fetch/recording-adapter.js";
import { normalize } from "../src/normalize/index.js";
import { runSeed } from "../src/run.js";
import {
  filterFactsToClubSeason,
  isPairInSeedScope,
  seasonLabelInCompetitionScope,
} from "../src/scope/club-season.js";
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

async function prepareDatabase() {
  await resetDatabase(TEST_DATABASE_URL, migrationsFolder);
}

async function squadCountsByLabel(db: ReturnType<typeof createDb>["db"]) {
  const rows = await db
    .select({
      label: season.label,
      squadRows: sql<number>`count(${playerClubSeason.id})::int`,
      withJersey: sql<number>`count(*) filter (where ${playerClubSeason.squadNumber} is not null)::int`,
    })
    .from(season)
    .leftJoin(playerClubSeason, eq(playerClubSeason.seasonId, season.id))
    .groupBy(season.label);

  return Object.fromEntries(
    rows.map((row) => [row.label, { squadRows: row.squadRows, withJersey: row.withJersey }]),
  );
}

describe("filterFactsToClubSeason", () => {
  it("drops seasons and clubs outside the requested pair", async () => {
    const adapter = createFixtureFetchAdapter(fixturePath);
    const raw = await adapter.fetchClubSeason({
      competition: "dk1",
      clubExternalId: "club-190",
      season: "23/24",
    });
    const facts = normalize(raw);

    const scoped = filterFactsToClubSeason(facts, {
      seasonLabel: "23/24",
      clubExternalId: "club-190",
    });

    expect(scoped.seasons).toHaveLength(1);
    expect(scoped.seasons[0]?.label).toBe("23/24");
    expect(scoped.seasons[0]?.clubs).toHaveLength(1);
    expect(scoped.seasons[0]?.clubs[0]?.externalId).toBe("club-190");

    const wrongSeason = filterFactsToClubSeason(facts, {
      seasonLabel: "22/23",
      clubExternalId: "club-190",
    });
    expect(wrongSeason.seasons).toHaveLength(0);
  });
});

describe("isPairInSeedScope", () => {
  it("accepts only the resolved club season label", () => {
    expect(
      isPairInSeedScope(
        {
          kind: "club",
          competition: "dk1",
          clubExternalId: "club-190",
          season: "23/24",
        },
        "23/24",
      ),
    ).toBe(true);
    expect(
      isPairInSeedScope(
        {
          kind: "club",
          competition: "dk1",
          clubExternalId: "club-190",
          season: "23/24",
        },
        "22/23",
      ),
    ).toBe(false);
  });

  it("bounds competition scope to the requested season range", () => {
    const scope = {
      kind: "competition" as const,
      competition: "superligaen",
      fromSeason: "2017/18",
      toSeason: "2017/18",
    };
    expect(seasonLabelInCompetitionScope(scope, "2017/18")).toBe(true);
    expect(seasonLabelInCompetitionScope(scope, "2016/17")).toBe(false);
    expect(isPairInSeedScope(scope, "2016/17")).toBe(false);
  });

  it("accepts bare-year competition scope against split-year pair labels", () => {
    const scope = {
      kind: "competition" as const,
      competition: "superligaen",
      fromSeason: "2015",
      toSeason: "2015",
    };
    expect(seasonLabelInCompetitionScope(scope, "2015/16")).toBe(true);
    expect(seasonLabelInCompetitionScope(scope, "2016/17")).toBe(false);
  });
});

describe.sequential("runSeed season-scope isolation", () => {
  it("does not mutate another season when re-running a scoped competition seed (skip path)", async () => {
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

    await runSeed({
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

    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const before = await squadCountsByLabel(db);

      const second = await runSeed({
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

      const after = await squadCountsByLabel(db);

      expect(second.summary.fetched).toBe(0);
      expect(second.summary.skipped).toBe(2);
      expect(second.summary.mapped).toBe(0);
      expect(after["22/23"]).toEqual(before["22/23"]);
    } finally {
      await pool.end();
    }
  });

  it("rejects mislabeled fetch payloads instead of writing into another season", async () => {
    await prepareDatabase();
    const inner = createFixtureFetchAdapter(fixturePath);
    const mislabeledAdapter: FetchAdapter = {
      ...inner,
      async fetchClubSeason(params) {
        const raw = await inner.fetchClubSeason(params);
        if (params.season === "23/24") {
          return {
            ...raw,
            seasons: raw.seasons.map((seasonRow) => ({
              ...seasonRow,
              label: "22/23",
            })),
          };
        }
        return raw;
      },
    };

    await runSeed({
      scope: {
        kind: "club",
        competition: "dk1",
        clubExternalId: "club-190",
        season: "22/23",
      },
      lane: "development",
      fetchAdapter: mislabeledAdapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const before = await squadCountsByLabel(db);

      const result = await runSeed({
        scope: {
          kind: "club",
          competition: "dk1",
          clubExternalId: "club-191",
          season: "23/24",
        },
        lane: "development",
        fetchAdapter: mislabeledAdapter,
        databaseUrl: TEST_DATABASE_URL,
      });

      const after = await squadCountsByLabel(db);

      expect(result.summary.fetched).toBe(1);
      expect(result.summary.failures).toHaveLength(1);
      expect(result.summary.failures[0]?.error).toMatch(
        /did not contain club club-191 for season 23\/24/,
      );
      expect(result.summary.mapped).toBe(0);
      expect(after["22/23"]).toEqual(before["22/23"]);
      expect(after["23/24"]).toBeUndefined();
    } finally {
      await pool.end();
    }
  });
});
