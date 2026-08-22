import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { catalogLabel, createDb, externalId, playerClubSeason, resetDatabase } from "@kit/db";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createKaderFetchAdapter,
  TransfermarktHttpError,
} from "../src/fetch/kader-fetch-adapter.js";
import { createRecordingFetchAdapter } from "../src/fetch/recording-adapter.js";
import { TransfermarktCircuitOpenError } from "../src/fetch/transfermarkt-rate-limit.js";
import { normalize } from "../src/normalize/index.js";
import { runSeed } from "../src/run.js";
import { TM_SYSTEM } from "../src/types.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/kader-html",
);

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_test";

async function prepareDatabase() {
  await resetDatabase(DATABASE_URL, migrationsFolder);
}

describe("kader fetch adapter from recorded HTML", () => {
  it("lists club-season pairs from competition season page recordings", async () => {
    const adapter = createKaderFetchAdapter({ fixturesDir });
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
    const adapter = createKaderFetchAdapter({ fixturesDir });
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

  it("maps kader jersey numbers to jerseyNumber in raw payload", async () => {
    const adapter = createKaderFetchAdapter({ fixturesDir });
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

  it("does not profile-hop when kader rows have id and jersey number", async () => {
    const profileFetches: string[] = [];
    const adapter = createKaderFetchAdapter({
      fixturesDir,
      onProfileFetch: (playerId) => profileFetches.push(playerId),
    });

    await adapter.fetchClubSeason({
      competition: "superligaen",
      clubExternalId: "190",
      season: "2015/16",
    });

    expect(profileFetches).toEqual([]);
  });

  it("profile-hops when a kader row is missing jersey number", async () => {
    const profileFetches: string[] = [];
    const adapter = createKaderFetchAdapter({
      fixturesDir,
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

  it("reports missing jersey numbers and continues the run", async () => {
    const warnings: string[] = [];
    const adapter = createKaderFetchAdapter({
      fixturesDir,
      onMissingJerseyNumber: (warning) => {
        warnings.push(`${warning.playerId}:${warning.playerName}`);
      },
    });

    await adapter.fetchClubSeason({
      competition: "superligaen",
      clubExternalId: "191",
      season: "2015/16",
    });

    expect(warnings).toEqual(["99999:Rasmus Hojlund"]);
  });

  it("reuses competition season HTML for every club in the same season", async () => {
    const competitionHtml = readFileSync(
      path.join(fixturesDir, "competitions/DK1-2015.html"),
      "utf8",
    );
    const kader190 = readFileSync(path.join(fixturesDir, "kader/190-2015.html"), "utf8");
    const kader191 = readFileSync(path.join(fixturesDir, "kader/191-2015.html"), "utf8");
    const profile99999 = readFileSync(path.join(fixturesDir, "profiles/player-99999.html"), "utf8");

    let competitionFetches = 0;
    const adapter = createKaderFetchAdapter({
      fetchHtml: async (url) => {
        if (url.includes("/wettbewerb/")) {
          competitionFetches += 1;
          return competitionHtml;
        }
        if (url.includes("/verein/190/")) {
          return kader190;
        }
        if (url.includes("/verein/191/")) {
          return kader191;
        }
        if (url.includes("/spieler/99999")) {
          return profile99999;
        }
        throw new Error(`unexpected live fetch: ${url}`);
      },
    });

    await adapter.fetchClubSeason({
      competition: "superligaen",
      clubExternalId: "190",
      season: "2015/16",
    });
    await adapter.fetchClubSeason({
      competition: "superligaen",
      clubExternalId: "191",
      season: "2015/16",
    });

    expect(competitionFetches).toBe(1);
  });

  it("writes live HTML to cacheDir and avoids a second network fetch for the same URL", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "kader-live-cache-"));
    const competitionHtml = readFileSync(
      path.join(fixturesDir, "competitions/DK1-2015.html"),
      "utf8",
    );
    const kader190 = readFileSync(path.join(fixturesDir, "kader/190-2015.html"), "utf8");
    let networkCalls = 0;

    const adapter = createKaderFetchAdapter({
      cacheDir,
      fetchHtml: async (url) => {
        networkCalls += 1;
        if (url.includes("/wettbewerb/")) {
          return competitionHtml;
        }
        if (url.includes("/verein/190/")) {
          return kader190;
        }
        throw new Error(`unexpected live fetch: ${url}`);
      },
    });

    await adapter.fetchClubSeason({
      competition: "superligaen",
      clubExternalId: "190",
      season: "2015/16",
    });
    await adapter.fetchClubSeason({
      competition: "superligaen",
      clubExternalId: "190",
      season: "2015/16",
    });

    expect(networkCalls).toBe(2);
  });

  it("treats a profile HTTP 403 as a hole and still maps the rest of the club", async () => {
    const competitionHtml = readFileSync(
      path.join(fixturesDir, "competitions/DK1-2015.html"),
      "utf8",
    );
    const kader191 = readFileSync(path.join(fixturesDir, "kader/191-2015.html"), "utf8");
    const profileHoles: string[] = [];

    const adapter = createKaderFetchAdapter({
      fetchHtml: async (url) => {
        if (url.includes("/wettbewerb/")) {
          return competitionHtml;
        }
        if (url.includes("/verein/191/")) {
          return kader191;
        }
        if (url.includes("/spieler/99999")) {
          throw new TransfermarktHttpError(403, url);
        }
        throw new Error(`unexpected live fetch: ${url}`);
      },
      onProfileHole: (playerId) => profileHoles.push(playerId),
    });

    const raw = await adapter.fetchClubSeason({
      competition: "superligaen",
      clubExternalId: "191",
      season: "2015/16",
    });

    expect(profileHoles).toEqual(["99999"]);
    const facts = normalize(raw);
    const players = facts.seasons[0]?.clubs[0]?.players ?? [];
    expect(players.find((p) => p.externalId === "22221")?.squadNumber).toBe(7);
    expect(players.find((p) => p.externalId === "99999")?.squadNumber).toBeUndefined();
  });
});

describe("kader fetch adapter rate limiting", () => {
  it("stops further Transfermarkt GETs after consecutive HTTP 403 responses", async () => {
    let networkCalls = 0;
    const adapter = createKaderFetchAdapter({
      rateLimitStopAfter: 1,
      fetchHtml: async (url) => {
        networkCalls += 1;
        throw new TransfermarktHttpError(403, url);
      },
    });

    await expect(
      adapter.fetchClubSeason({
        competition: "superligaen",
        clubExternalId: "190",
        season: "2015/16",
      }),
    ).rejects.toBeInstanceOf(TransfermarktHttpError);

    await expect(
      adapter.fetchClubSeason({
        competition: "superligaen",
        clubExternalId: "191",
        season: "2015/16",
      }),
    ).rejects.toBeInstanceOf(TransfermarktCircuitOpenError);

    expect(networkCalls).toBe(1);
  });

  it("continues the club walk without further network calls once the circuit is open", async () => {
    let networkCalls = 0;
    const fixturesAdapter = createKaderFetchAdapter({ fixturesDir });
    const rateLimited = createKaderFetchAdapter({
      rateLimitStopAfter: 1,
      fetchHtml: async (url) => {
        networkCalls += 1;
        throw new TransfermarktHttpError(403, url);
      },
    });
    const adapter = {
      listClubSeasonPairs: (params: Parameters<typeof fixturesAdapter.listClubSeasonPairs>[0]) =>
        fixturesAdapter.listClubSeasonPairs(params),
      fetchClubSeason: (params: Parameters<typeof rateLimited.fetchClubSeason>[0]) =>
        rateLimited.fetchClubSeason(params),
    };

    const pairs = await adapter.listClubSeasonPairs({
      competition: "superligaen",
      fromSeason: "2015",
      toSeason: "2015",
    });
    const failures: unknown[] = [];

    for (const pair of pairs) {
      try {
        await adapter.fetchClubSeason({
          competition: "superligaen",
          clubExternalId: pair.clubExternalId,
          season: pair.seasonLabel,
        });
      } catch (error: unknown) {
        failures.push(error);
      }
    }

    expect(failures).toHaveLength(2);
    expect(failures[0]).toBeInstanceOf(TransfermarktHttpError);
    expect(failures[1]).toBeInstanceOf(TransfermarktCircuitOpenError);
    expect(networkCalls).toBe(1);
  });
});

describe("kader fetch adapter live HTTP errors", () => {
  it("throws on HTTP 202 without falling back to Apify", async () => {
    const adapter = createKaderFetchAdapter({
      fetchHtml: async () => {
        throw new TransfermarktHttpError(202, "https://www.transfermarkt.com/example");
      },
    });

    await expect(
      adapter.fetchClubSeason({
        competition: "superligaen",
        clubExternalId: "190",
        season: "2015/16",
      }),
    ).rejects.toBeInstanceOf(TransfermarktHttpError);
  });
});

describe("runSeed with kader HTML adapter", () => {
  beforeAll(async () => {
    await prepareDatabase();
  });

  it("upserts PlayerClubSeason jersey numbers via normalize and map", async () => {
    await prepareDatabase();
    const inner = createKaderFetchAdapter({ fixturesDir });
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
      databaseUrl: DATABASE_URL,
    });

    expect(result.summary.fetched).toBe(1);
    expect(result.summary.mapped).toBeGreaterThan(0);

    const { db, pool } = createDb(DATABASE_URL);
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

  it("strips forbidden fields from mapped kader payload", async () => {
    const adapter = createKaderFetchAdapter({ fixturesDir });
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
    const inner = createKaderFetchAdapter({ fixturesDir });
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
      databaseUrl: DATABASE_URL,
    });

    expect(recording.getFetchCalls()).toHaveLength(2);
    expect(result.summary.fetched).toBe(2);
    expect(result.summary.failures).toHaveLength(0);

    const { db, pool } = createDb(DATABASE_URL);
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
