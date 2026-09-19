import path from "node:path";
import { fileURLToPath } from "node:url";
import { catalogLabel, createDb, externalId, playerClubSeason, resetDatabase } from "@kit/db";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { PINNED_ACTOR_ID, SQUADS_DATASET } from "../src/fetch/actor-constants.js";
import { createApifyFetchAdapter } from "../src/fetch/apify-adapter.js";
import { createRecordingFetchAdapter } from "../src/fetch/recording-adapter.js";
import { normalize } from "../src/normalize/index.js";
import { runSeed } from "../src/run.js";
import { TM_SYSTEM } from "../src/types.js";
import { resolveSeedApifyTestDatabaseUrl } from "./test-database-url.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const recordingsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/actor-recordings",
);

const TEST_DATABASE_URL = resolveSeedApifyTestDatabaseUrl();

async function prepareDatabase() {
  await resetDatabase(TEST_DATABASE_URL, migrationsFolder);
}

describe("apify fetch adapter constants", () => {
  it("pins the automation-lab actor and named squads dataset", () => {
    expect(PINNED_ACTOR_ID).toBe("automation-lab/transfermarkt-scraper");
    expect(SQUADS_DATASET).toBe("squads");
  });
});

describe("apify fetch adapter from actor recordings", () => {
  it("lists club-season pairs from competition season page recordings", async () => {
    const adapter = createApifyFetchAdapter({ recordingsDir });
    const pairs = await adapter.listClubSeasonPairs({
      competition: "superligaen",
      fromSeason: "2015",
      toSeason: "2015",
    });

    expect(pairs).toEqual([
      { clubExternalId: "190", seasonLabel: "2015/16" },
      { clubExternalId: "191", seasonLabel: "2015/16" },
    ]);
  });

  it("maps superliga and superligaen slugs to DK1 competition", async () => {
    const adapter = createApifyFetchAdapter({ recordingsDir });
    const superligaPayload = await adapter.fetchClubSeason({
      competition: "superliga",
      clubExternalId: "190",
      season: "2015/16",
    });
    const superligaenPayload = await adapter.fetchClubSeason({
      competition: "superligaen",
      clubExternalId: "190",
      season: "2015/16",
    });

    expect(superligaPayload.competition.id).toBe("dk1");
    expect(superligaenPayload.competition.id).toBe("dk1");
    expect(superligaPayload.seasons[0]?.label).toBe("2015/16");
    expect(superligaenPayload.seasons[0]?.label).toBe("2015/16");
  });

  it("maps squad shirtNumber to jerseyNumber in raw payload", async () => {
    const adapter = createApifyFetchAdapter({ recordingsDir });
    const raw = await adapter.fetchClubSeason({
      competition: "superligaen",
      clubExternalId: "190",
      season: "2015/16",
    });

    const facts = normalize(raw);
    const players = facts.seasons[0]?.clubs[0]?.players ?? [];
    expect(players.find((p) => p.externalId === "11111")?.squadNumber).toBe(23);
    expect(players.find((p) => p.externalId === "11112")?.squadNumber).toBe(4);
  });

  it("does not profile-hop when squad rows have id and shirtNumber", async () => {
    const profileFetches: string[] = [];
    const adapter = createApifyFetchAdapter({
      recordingsDir,
      onProfileFetch: (playerId) => profileFetches.push(playerId),
    });

    await adapter.fetchClubSeason({
      competition: "superligaen",
      clubExternalId: "190",
      season: "2015/16",
    });

    expect(profileFetches).toEqual([]);
  });

  it("profile-hops when a squad row is missing shirtNumber", async () => {
    const profileFetches: string[] = [];
    const adapter = createApifyFetchAdapter({
      recordingsDir,
      onProfileFetch: (playerId) => profileFetches.push(playerId),
    });

    const raw = await adapter.fetchClubSeason({
      competition: "superligaen",
      clubExternalId: "191",
      season: "2015/16",
    });

    expect(profileFetches).toEqual(["99999"]);
    const facts = normalize(raw);
    const hojlund = facts.seasons[0]?.clubs[0]?.players.find((p) => p.externalId === "99999");
    expect(hojlund?.squadNumber).toBe(9);
  });
});

describe("runSeed with apify adapter recordings", () => {
  beforeAll(async () => {
    await prepareDatabase();
  });

  it("upserts PlayerClubSeason jersey numbers via normalize and map", async () => {
    await prepareDatabase();
    const inner = createApifyFetchAdapter({ recordingsDir });
    const { adapter } = createRecordingFetchAdapter(inner);

    const result = await runSeed({
      scope: {
        kind: "club",
        competition: "superligaen",
        clubExternalId: "191",
        season: "2015/16",
      },
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    expect(result.summary.fetched).toBe(1);
    expect(result.summary.mapped).toBeGreaterThan(0);

    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const pcsRows = await db
        .select({ squadNumber: playerClubSeason.squadNumber })
        .from(playerClubSeason);
      expect(pcsRows.some((row) => row.squadNumber === 7)).toBe(true);
      expect(pcsRows.some((row) => row.squadNumber === 9)).toBe(true);

      const playerIds = await db
        .select({ value: externalId.value })
        .from(externalId)
        .where(and(eq(externalId.system, TM_SYSTEM), eq(externalId.entityType, "player")));
      expect(playerIds.some((row) => row.value === "99999")).toBe(true);
    } finally {
      await pool.end();
    }
  });

  it("strips forbidden fields from mapped actor payload", async () => {
    const adapter = createApifyFetchAdapter({ recordingsDir });
    const raw = await adapter.fetchClubSeason({
      competition: "superligaen",
      clubExternalId: "190",
      season: "2015/16",
    });

    const facts = normalize(raw);
    expect(facts.seasons[0]?.clubs[0]).not.toHaveProperty("marketValue");
    expect(facts.seasons[0]?.clubs[0]?.players[0]).not.toHaveProperty("marketValue");
  });

  it("walks competition scope from season-page club list", async () => {
    await prepareDatabase();
    const inner = createApifyFetchAdapter({ recordingsDir });
    const recording = createRecordingFetchAdapter(inner);

    const result = await runSeed({
      scope: {
        kind: "competition",
        competition: "superligaen",
        fromSeason: "2015",
        toSeason: "2015",
      },
      lane: "development",
      fetchAdapter: recording.adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    expect(recording.getFetchCalls()).toHaveLength(2);
    expect(result.summary.fetched).toBe(2);
    expect(result.summary.failures).toHaveLength(0);

    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const clubLabels = await db
        .select({ text: catalogLabel.text })
        .from(catalogLabel)
        .where(and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.kind, "label")));
      expect(clubLabels.some((row) => row.text === "FC Copenhagen")).toBe(true);
      expect(clubLabels.some((row) => row.text === "Brondby IF")).toBe(true);
    } finally {
      await pool.end();
    }
  });
});
