import { fileURLToPath } from "node:url";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  catalogLabel,
  createDb,
  externalId,
  resetDatabase,
} from "@kit/db";
import { createFixtureFetchAdapter } from "../src/fetch/fixture-adapter.js";
import { normalize, stripForbiddenFields } from "../src/normalize/index.js";
import { mapFacts } from "../src/map/index.js";
import { parseLane } from "../src/lane.js";
import { filterSeasons } from "../src/season-range.js";
import { parseCliArgs, runSeed } from "../src/run.js";
import { TM_SYSTEM } from "../src/types.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/superliga-mini.json",
);

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_test";

async function prepareDatabase() {
  await resetDatabase(DATABASE_URL, migrationsFolder);
}

describe("normalize", () => {
  it("drops forbidden Transfermarkt fields before mapping", async () => {
    const adapter = createFixtureFetchAdapter(fixturePath);
    const raw = await adapter.fetch({
      competition: "dk1",
      fromSeason: "0001",
      toSeason: "0002",
    });

    expect(raw.seasons[1]?.clubs[0]?.marketValue).toBeDefined();
    expect(raw.seasons[1]?.clubs[0]?.agent).toBeDefined();

    const stripped = stripForbiddenFields(raw);
    expect(stripped.seasons[1]?.clubs[0]).not.toHaveProperty("marketValue");
    expect(stripped.seasons[1]?.clubs[0]).not.toHaveProperty("agent");
    expect(stripped.seasons[1]?.clubs[0]).not.toHaveProperty("tmLogoUrl");
    expect(stripped.seasons[1]?.clubs[0]?.players[0]).not.toHaveProperty("marketValue");
    expect(stripped.seasons[1]?.clubs[0]?.players[0]).not.toHaveProperty("agent");

    const facts = normalize(raw);
    expect(facts.league.name).toBe("Superligaen");
    expect(facts.seasons).toHaveLength(2);
    expect(facts.seasons[1]?.clubs[0]?.players[0]?.squadNumber).toBe(23);
  });

  it("assigns en labels for clubs and mul for players", async () => {
    const adapter = createFixtureFetchAdapter(fixturePath);
    const raw = await adapter.fetch({
      competition: "dk1",
      fromSeason: "0002",
      toSeason: "0002",
    });
    const facts = normalize(raw);
    const season = facts.seasons.find((s) => s.label === "23/24");
    expect(season?.clubs[0]?.nameLocale).toBe("en");
    expect(season?.clubs[0]?.players[0]?.nameLocale).toBe("mul");
  });
});

describe("season range", () => {
  it("treats 0001 as the competition first season", async () => {
    const adapter = createFixtureFetchAdapter(fixturePath);
    const raw = await adapter.fetch({
      competition: "dk1",
      fromSeason: "0001",
      toSeason: "0002",
    });
    const facts = normalize(raw);
    const selected = filterSeasons(facts.seasons, "0001", "0002");
    expect(selected.map((s) => s.label)).toEqual(["22/23", "23/24"]);
  });

  it("selects a single season by label", async () => {
    const adapter = createFixtureFetchAdapter(fixturePath);
    const raw = await adapter.fetch({
      competition: "dk1",
      fromSeason: "23/24",
      toSeason: "23/24",
    });
    const facts = normalize(raw);
    const selected = filterSeasons(facts.seasons, "23/24", "23/24");
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
    const args = parseCliArgs(["node", "seed-apify", "dk1", "0001", "today", "development"]);
    expect(args).toEqual({
      competition: "dk1",
      fromSeason: "0001",
      toSeason: "today",
      lane: "development",
    });
  });
});

describe("mapper idempotency", () => {
  beforeAll(async () => {
    await prepareDatabase();
  });

  it("keeps the same UUIDs on a second map of the same fixture", async () => {
    const adapter = createFixtureFetchAdapter(fixturePath);
    const raw = await adapter.fetch({
      competition: "dk1",
      fromSeason: "0002",
      toSeason: "0002",
    });
    const facts = normalize(raw);
    const scoped = {
      ...facts,
      seasons: filterSeasons(facts.seasons, "0002", "0002"),
    };

    const { db, pool: dbPool } = createDb(DATABASE_URL);
    try {
      await mapFacts(db, scoped);
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

      const secondResult = await mapFacts(db, scoped);
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
    const { db, pool: dbPool } = createDb(DATABASE_URL);
    try {
      await runSeed({
        competition: "dk1",
        fromSeason: "0002",
        toSeason: "0002",
        lane: "development",
        fetchAdapter: createFixtureFetchAdapter(fixturePath),
        databaseUrl: DATABASE_URL,
      });

      const clubLabel = await db
        .select({ text: catalogLabel.text, locale: catalogLabel.locale })
        .from(catalogLabel)
        .where(
          and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.locale, "en"), eq(catalogLabel.kind, "label")),
        );

      expect(clubLabel.some((row) => row.text === "FC Copenhagen")).toBe(true);

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

      expect(playerLabel.some((row) => row.text === "Jonas Wind")).toBe(true);
    } finally {
      await dbPool.end();
    }
  });
});
