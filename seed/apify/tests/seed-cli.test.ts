import path from "node:path";
import { fileURLToPath } from "node:url";
import { catalogLabel, createDb, externalId, resetDatabase } from "@kit/db";
import { resolveSeasonRef } from "@kit/seed-shared";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { FetchAdapter } from "../src/fetch/adapter.js";
import { createFixtureFetchAdapter } from "../src/fetch/fixture-adapter.js";
import { createRecordingFetchAdapter } from "../src/fetch/recording-adapter.js";
import { parseLane } from "../src/lane.js";
import { mapFacts } from "../src/map/index.js";
import { normalize, stripForbiddenFields } from "../src/normalize/index.js";
import { parseCliArgs, runSeed } from "../src/run.js";
import { filterSeasons } from "../src/season-range.js";
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

const TEST_DATABASE_URL = resolveSeedApifyTestDatabaseUrl();

async function prepareDatabase() {
  await resetDatabase(TEST_DATABASE_URL, migrationsFolder);
}

describe("normalize", () => {
  it("drops forbidden Transfermarkt fields before mapping", async () => {
    const adapter = createFixtureFetchAdapter(fixturePath);
    const raw = await adapter.fetchClubSeason({
      competition: "dk1",
      clubExternalId: "club-190",
      season: "23/24",
    });

    expect(raw.seasons[0]?.clubs[0]?.marketValue).toBeDefined();
    expect(raw.seasons[0]?.clubs[0]?.agent).toBeDefined();

    const stripped = stripForbiddenFields(raw);
    expect(stripped.seasons[0]?.clubs[0]).not.toHaveProperty("marketValue");
    expect(stripped.seasons[0]?.clubs[0]).not.toHaveProperty("agent");
    expect(stripped.seasons[0]?.clubs[0]).not.toHaveProperty("tmLogoUrl");
    expect(stripped.seasons[0]?.clubs[0]?.players[0]).not.toHaveProperty("marketValue");
    expect(stripped.seasons[0]?.clubs[0]?.players[0]).not.toHaveProperty("agent");

    const facts = normalize(raw);
    expect(facts.league.name).toBe("Superligaen");
    expect(facts.seasons).toHaveLength(1);
    expect(facts.seasons[0]?.clubs[0]?.players[0]?.squadNumber).toBe(23);
  });

  it("assigns en for clubs and mul only for locale-invariant player names", async () => {
    const adapter = createFixtureFetchAdapter(fixturePath);
    const raw = await adapter.fetchClubSeason({
      competition: "dk1",
      clubExternalId: "club-191",
      season: "23/24",
    });
    const facts = normalize(raw);
    const season = facts.seasons[0];
    expect(season?.clubs[0]?.nameLocale).toBe("en");
    expect(season?.clubs[0]?.players[0]?.nameLocale).toBe("mul");
    expect(season?.clubs[0]?.players[1]?.nameLocale).toBe("en");
  });
});

describe("season range", () => {
  it("resolves 0001 to the competition first Transfermarkt season label", () => {
    expect(resolveSeasonRef("dk1", "0001")).toBe("1991/92");
    expect(resolveSeasonRef("superligaen", "0001")).toBe("1991/92");
  });

  it("does not rewrite season labels like 1995/96 to 0001", () => {
    expect(resolveSeasonRef("dk1", "1995/96")).toBe("1995/96");
    expect(resolveSeasonRef("dk1", "23/24")).toBe("23/24");
  });

  it("selects seasons by label within fixture data", async () => {
    const { readFile } = await import("node:fs/promises");
    const raw = JSON.parse(await readFile(fixturePath, "utf8"));
    const facts = normalize(raw);
    const selected = filterSeasons(facts.seasons, "dk1", "22/23", "23/24");
    expect(selected.map((s) => s.label)).toEqual(["22/23", "23/24"]);
  });

  it("selects a single season by label", async () => {
    const { readFile } = await import("node:fs/promises");
    const raw = JSON.parse(await readFile(fixturePath, "utf8"));
    const facts = normalize(raw);
    const selected = filterSeasons(facts.seasons, "dk1", "23/24", "23/24");
    expect(selected).toHaveLength(1);
    expect(selected[0]?.clubs).toHaveLength(2);
  });
});

describe("lane guard", () => {
  it("rejects production lane", () => {
    expect(() => parseLane("production")).toThrow(/production is rejected/);
  });

  it("accepts development and staging", () => {
    expect(parseLane("development")).toBe("development");
    expect(parseLane("staging")).toBe("staging");
  });
});

describe("CLI args", () => {
  it("parses competition, season range, and lane", () => {
    const parsed = parseCliArgs(["node", "seed-apify", "dk1", "0001", "today", "development"]);
    expect(parsed.mode).toBe("walk");
    if (parsed.mode !== "walk") {
      throw new Error("expected walk mode");
    }
    expect(parsed.scope).toEqual({
      kind: "competition",
      competition: "dk1",
      fromSeason: "0001",
      toSeason: "today",
    });
    expect(parsed.lane).toBe("development");
  });

  it("parses club + season scope", () => {
    const parsed = parseCliArgs(["node", "seed-apify", "club", "dk1", "club-190", "23/24"]);
    expect(parsed.mode).toBe("walk");
    if (parsed.mode !== "walk") {
      throw new Error("expected walk mode");
    }
    expect(parsed.scope).toEqual({
      kind: "club",
      competition: "dk1",
      clubExternalId: "club-190",
      season: "23/24",
    });
    expect(parsed.lane).toBe("development");
  });
});

describe("runSeed scope walk", () => {
  beforeAll(async () => {
    await prepareDatabase();
  });

  it("returns fetched/skipped/mapped counts instead of roster JSON", async () => {
    const inner = createFixtureFetchAdapter(fixturePath);
    const { adapter } = createRecordingFetchAdapter(inner);

    const result = await runSeed({
      scope: {
        kind: "club",
        competition: "dk1",
        clubExternalId: "club-190",
        season: "23/24",
      },
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    expect(result.summary.fetched).toBe(1);
    expect(result.summary.skipped).toBe(0);
    expect(result.summary.mapped).toBeGreaterThan(0);
    expect(result.summary.failures).toHaveLength(0);
    expect(result).not.toHaveProperty("mapResult");
  });

  it("skips fetch on a second run when club-season is already seeded", async () => {
    await prepareDatabase();
    const inner = createFixtureFetchAdapter(fixturePath);
    const recording = createRecordingFetchAdapter(inner);

    const scope = {
      kind: "club" as const,
      competition: "dk1",
      clubExternalId: "club-190",
      season: "23/24",
    };

    await runSeed({
      scope,
      lane: "development",
      fetchAdapter: recording.adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    expect(recording.getFetchCalls()).toHaveLength(1);

    const second = await runSeed({
      scope,
      lane: "development",
      fetchAdapter: recording.adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    expect(recording.getFetchCalls()).toHaveLength(1);
    expect(second.summary.skipped).toBe(1);
    expect(second.summary.fetched).toBe(0);
  });

  it("fetches a later season when the club already exists", async () => {
    await prepareDatabase();
    const inner = createFixtureFetchAdapter(fixturePath);
    const recording = createRecordingFetchAdapter(inner);

    await runSeed({
      scope: {
        kind: "club",
        competition: "dk1",
        clubExternalId: "club-190",
        season: "23/24",
      },
      lane: "development",
      fetchAdapter: recording.adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    const result = await runSeed({
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

    expect(recording.getFetchCalls()).toHaveLength(2);
    expect(recording.getFetchCalls()[1]?.season).toBe("22/23");
    expect(result.summary.fetched).toBe(1);
    expect(result.summary.skipped).toBe(0);
  });

  it("resolves 0001 to the first season on club scope", async () => {
    await prepareDatabase();
    const inner = createFixtureFetchAdapter(fixturePath);
    const recording = createRecordingFetchAdapter(inner);

    const result = await runSeed({
      scope: {
        kind: "club",
        competition: "dk1",
        clubExternalId: "club-190",
        season: "0001",
      },
      lane: "development",
      fetchAdapter: recording.adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    expect(recording.getFetchCalls()).toHaveLength(1);
    expect(recording.getFetchCalls()[0]?.season).toBe("1991/92");
    expect(result.summary.fetched).toBe(1);
    expect(result.summary.mapped).toBeGreaterThan(0);
  });

  it("reports a failed club-season and continues the walk", async () => {
    await prepareDatabase();
    const inner = createFixtureFetchAdapter(fixturePath);
    const failingAdapter: FetchAdapter = {
      ...inner,
      async listClubSeasonPairs(params) {
        return inner.listClubSeasonPairs(params);
      },
      async fetchClubSeason(params) {
        if (params.clubExternalId === "club-missing") {
          throw new Error("Missing kader for club club-missing season 23/24");
        }
        return inner.fetchClubSeason(params);
      },
    };

    const result = await runSeed({
      scope: {
        kind: "competition",
        competition: "dk1",
        fromSeason: "23/24",
        toSeason: "23/24",
      },
      lane: "development",
      fetchAdapter: {
        ...failingAdapter,
        async listClubSeasonPairs() {
          return [
            { clubExternalId: "club-missing", seasonLabel: "23/24" },
            { clubExternalId: "club-190", seasonLabel: "23/24" },
          ];
        },
      },
      databaseUrl: TEST_DATABASE_URL,
    });

    expect(result.summary.failures).toHaveLength(1);
    expect(result.summary.failures[0]?.clubExternalId).toBe("club-missing");
    expect(result.summary.fetched).toBe(1);
    expect(result.summary.mapped).toBeGreaterThan(0);
  });
});

describe("mapper idempotency", () => {
  beforeAll(async () => {
    await prepareDatabase();
  });

  it("keeps the same UUIDs on a second map of the same fixture", async () => {
    const adapter = createFixtureFetchAdapter(fixturePath);
    const raw = await adapter.fetchClubSeason({
      competition: "dk1",
      clubExternalId: "club-190",
      season: "23/24",
    });
    const facts = normalize(raw);

    const { db, pool: dbPool } = createDb(TEST_DATABASE_URL);
    try {
      await mapFacts(db, facts);
      const firstIds = await db
        .select({ entityId: externalId.entityId, value: externalId.value })
        .from(externalId)
        .where(eq(externalId.system, TM_SYSTEM));

      const firstLabels = await db
        .select({
          entityType: catalogLabel.entityType,
          entityId: catalogLabel.entityId,
          locale: catalogLabel.locale,
          text: catalogLabel.text,
        })
        .from(catalogLabel);

      const secondResult = await mapFacts(db, facts);
      expect(secondResult.externalIds).toBe(0);
      expect(secondResult.countries).toBe(0);
      expect(secondResult.clubs).toBe(0);
      expect(secondResult.players).toBe(0);

      const secondIds = await db
        .select({ entityId: externalId.entityId, value: externalId.value })
        .from(externalId)
        .where(eq(externalId.system, TM_SYSTEM));

      expect(secondIds).toEqual(firstIds);

      const secondLabels = await db
        .select({
          entityType: catalogLabel.entityType,
          entityId: catalogLabel.entityId,
          locale: catalogLabel.locale,
          text: catalogLabel.text,
        })
        .from(catalogLabel);

      expect(secondLabels).toEqual(firstLabels);
    } finally {
      await dbPool.end();
    }
  });

  it("writes English club labels and mul player labels", async () => {
    await prepareDatabase();
    const { db, pool: dbPool } = createDb(TEST_DATABASE_URL);
    try {
      await runSeed({
        scope: {
          kind: "club",
          competition: "dk1",
          clubExternalId: "club-191",
          season: "23/24",
        },
        lane: "development",
        fetchAdapter: createFixtureFetchAdapter(fixturePath),
        databaseUrl: TEST_DATABASE_URL,
      });

      const clubLabel = await db
        .select({ text: catalogLabel.text, locale: catalogLabel.locale })
        .from(catalogLabel)
        .where(
          and(
            eq(catalogLabel.entityType, "club"),
            eq(catalogLabel.locale, "en"),
            eq(catalogLabel.kind, "label"),
          ),
        );

      expect(clubLabel.some((row) => row.text === "Brondby IF")).toBe(true);

      const playerLabel = await db
        .select({ text: catalogLabel.text, locale: catalogLabel.locale })
        .from(catalogLabel)
        .where(
          and(
            eq(catalogLabel.entityType, "player"),
            eq(catalogLabel.locale, "mul"),
            eq(catalogLabel.kind, "label"),
          ),
        );

      expect(playerLabel.some((row) => row.text === "Kevin Jakobsen")).toBe(true);

      const transliteratedPlayer = await db
        .select({ text: catalogLabel.text, locale: catalogLabel.locale })
        .from(catalogLabel)
        .where(
          and(
            eq(catalogLabel.entityType, "player"),
            eq(catalogLabel.text, "Rasmus Hojlund"),
            eq(catalogLabel.kind, "label"),
          ),
        );

      expect(transliteratedPlayer).toHaveLength(1);
      expect(transliteratedPlayer[0]?.locale).toBe("en");
    } finally {
      await dbPool.end();
    }
  });
});
