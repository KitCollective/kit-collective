import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { catalogLabel, createDb, externalId, playerClubSeason, resetDatabase } from "@kit/db";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  createKaderFetchAdapter,
  TransfermarktHttpError,
} from "../src/fetch/kader-fetch-adapter.js";
import { createRecordingFetchAdapter } from "../src/fetch/recording-adapter.js";
import { TransfermarktCircuitOpenError } from "../src/fetch/transfermarkt-rate-limit.js";
import { normalize } from "../src/normalize/index.js";
import { runSeed } from "../src/run.js";
import { TM_SYSTEM } from "../src/types.js";
import { resolveSeedApifyTestDatabaseUrl } from "./test-database-url.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/kader-html",
);

const TEST_DATABASE_URL = resolveSeedApifyTestDatabaseUrl();

/** Hermetic live-fetch tests: no real delay/backoff sleeps. */
const FAST_LIVE_FETCH = {
  requestDelayMs: 0,
  retryBaseDelayMs: 0,
} as const;

async function prepareDatabase() {
  await resetDatabase(TEST_DATABASE_URL, migrationsFolder);
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
      ...FAST_LIVE_FETCH,
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

  it("searches Transfermarkt for Premier League, then walks clubs on GB1", async () => {
    const searchHtml = readFileSync(path.join(fixturesDir, "search/competitions.html"), "utf8");
    const competitionHtml = readFileSync(
      path.join(fixturesDir, "competitions/DK1-2015.html"),
      "utf8",
    );
    const kader190 = readFileSync(path.join(fixturesDir, "kader/190-2015.html"), "utf8");
    const fetched: string[] = [];

    const adapter = createKaderFetchAdapter({
      ...FAST_LIVE_FETCH,
      fetchHtml: async (url) => {
        fetched.push(url);
        if (url.includes("schnellsuche")) {
          return searchHtml;
        }
        if (url.includes("/wettbewerb/GB1/")) {
          expect(url).toContain("/premier-league/startseite/wettbewerb/GB1");
          return competitionHtml;
        }
        if (url.includes("/verein/190/")) {
          return kader190;
        }
        throw new Error(`unexpected live fetch: ${url}`);
      },
    });

    const pairs = await adapter.listClubSeasonPairs({
      competition: "Premier League",
      fromSeason: "2019/20",
      toSeason: "2019/20",
    });
    const raw = await adapter.fetchClubSeason({
      competition: "Premier League",
      clubExternalId: "190",
      season: "2019/20",
    });

    expect(fetched.some((url) => url.includes("schnellsuche"))).toBe(true);
    expect(pairs).toEqual([
      { clubExternalId: "190", seasonLabel: "2019/20" },
      { clubExternalId: "191", seasonLabel: "2019/20" },
    ]);
    expect(raw.competition.id).toBe("gb1");
    expect(raw.competition.name).toBe("Premier League");
    expect(raw.competition.country.iso3166).toBe("GB");
    expect(raw.seasons[0]?.clubs[0]?.players[0]?.jerseyNumber).toBe(23);
  });

  it("searches Transfermarkt for La Liga, not the Danish country phrase", async () => {
    const searchHtml = readFileSync(path.join(fixturesDir, "search/competitions.html"), "utf8");
    const fetched: string[] = [];

    const adapter = createKaderFetchAdapter({
      ...FAST_LIVE_FETCH,
      fetchHtml: async (url) => {
        fetched.push(url);
        if (url.includes("schnellsuche")) {
          expect(url).toContain("query=La%20Liga");
          expect(url).not.toContain("Spanien");
          return searchHtml;
        }
        if (url.includes("/wettbewerb/ES1/")) {
          expect(url).toContain("/laliga/startseite/wettbewerb/ES1");
          return readFileSync(path.join(fixturesDir, "competitions/DK1-2015.html"), "utf8");
        }
        throw new Error(`unexpected live fetch: ${url}`);
      },
    });

    const pairs = await adapter.listClubSeasonPairs({
      competition: "La Liga i Spanien",
      fromSeason: "2019/20",
      toSeason: "2019/20",
    });
    expect(pairs).toHaveLength(2);
    expect(fetched.some((url) => url.includes("query=La%20Liga"))).toBe(true);
  });

  it("searches Super Lig for tyrkiske Superliga, then walks TR1", async () => {
    const searchHtml = readFileSync(path.join(fixturesDir, "search/competitions.html"), "utf8");
    const fetched: string[] = [];

    const adapter = createKaderFetchAdapter({
      ...FAST_LIVE_FETCH,
      fetchHtml: async (url) => {
        fetched.push(url);
        if (url.includes("schnellsuche")) {
          expect(url).toContain("query=Super%20Lig");
          expect(url).not.toContain("tyrkiske");
          return searchHtml;
        }
        if (url.includes("/wettbewerb/TR1/")) {
          expect(url).toContain("/super-lig/startseite/wettbewerb/TR1");
          return readFileSync(path.join(fixturesDir, "competitions/DK1-2015.html"), "utf8");
        }
        throw new Error(`unexpected live fetch: ${url}`);
      },
    });

    const pairs = await adapter.listClubSeasonPairs({
      competition: "tyrkiske Superliga",
      fromSeason: "2019/20",
      toSeason: "2019/20",
    });
    expect(pairs).toHaveLength(2);
    expect(fetched.some((url) => url.includes("/super-lig/startseite/wettbewerb/TR1"))).toBe(true);
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
      ...FAST_LIVE_FETCH,
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
      ...FAST_LIVE_FETCH,
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

  it("treats a squad row without player id as a hole and still maps the rest of the club", async () => {
    const competitionHtml = readFileSync(
      path.join(fixturesDir, "competitions/DK1-2015.html"),
      "utf8",
    );
    const kader193 = readFileSync(path.join(fixturesDir, "kader/193-2015.html"), "utf8");
    const profileFetches: string[] = [];

    const adapter = createKaderFetchAdapter({
      ...FAST_LIVE_FETCH,
      fetchHtml: async (url) => {
        if (url.includes("/wettbewerb/")) {
          return competitionHtml;
        }
        if (url.includes("/verein/193/")) {
          return kader193;
        }
        throw new Error(`unexpected live fetch: ${url}`);
      },
      onProfileFetch: (playerId) => profileFetches.push(playerId),
    });

    const raw = await adapter.fetchClubSeason({
      competition: "superligaen",
      clubExternalId: "193",
      season: "2015/16",
    });

    expect(profileFetches).toEqual([]);
    const facts = normalize(raw);
    const players = facts.seasons[0]?.clubs[0]?.players ?? [];
    expect(players).toHaveLength(1);
    expect(players[0]?.externalId).toBe("44444");
    expect(players[0]?.squadNumber).toBe(1);
  });
});

describe("kader fetch adapter polite fetch policy", () => {
  it("invokes configured delay between live Transfermarkt GETs", async () => {
    const competitionHtml = readFileSync(
      path.join(fixturesDir, "competitions/DK1-2015.html"),
      "utf8",
    );
    const kader190 = readFileSync(path.join(fixturesDir, "kader/190-2015.html"), "utf8");
    const kader191 = readFileSync(path.join(fixturesDir, "kader/191-2015.html"), "utf8");
    const sleptMs: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      sleptMs.push(ms);
    });
    let now = 0;
    const clock = { now: () => now };

    const adapter = createKaderFetchAdapter({
      requestDelayMs: 100,
      retryBaseDelayMs: 0,
      sleep,
      clock,
      fetchHtml: async (url) => {
        now += 10;
        if (url.includes("/wettbewerb/")) {
          return competitionHtml;
        }
        if (url.includes("/verein/190/")) {
          return kader190;
        }
        if (url.includes("/verein/191/")) {
          return kader191;
        }
        throw new Error(`unexpected live fetch: ${url}`);
      },
    });

    await adapter.fetchClubSeason({
      competition: "superligaen",
      clubExternalId: "190",
      season: "2015/16",
    });
    now += 20;
    await adapter.fetchClubSeason({
      competition: "superligaen",
      clubExternalId: "191",
      season: "2015/16",
    });

    expect(sleptMs.some((ms) => ms >= 80)).toBe(true);
  });

  it("maps a club after HTTP 403 then 200 on retry for the same URL", async () => {
    const competitionHtml = readFileSync(
      path.join(fixturesDir, "competitions/DK1-2015.html"),
      "utf8",
    );
    const kader190 = readFileSync(path.join(fixturesDir, "kader/190-2015.html"), "utf8");
    let competitionAttempts = 0;

    const adapter = createKaderFetchAdapter({
      ...FAST_LIVE_FETCH,
      retryMaxAttempts: 3,
      fetchHtml: async (url) => {
        if (url.includes("/wettbewerb/")) {
          competitionAttempts += 1;
          if (competitionAttempts === 1) {
            throw new TransfermarktHttpError(403, url);
          }
          return competitionHtml;
        }
        if (url.includes("/verein/190/")) {
          return kader190;
        }
        throw new Error(`unexpected live fetch: ${url}`);
      },
    });

    const raw = await adapter.fetchClubSeason({
      competition: "superligaen",
      clubExternalId: "190",
      season: "2015/16",
    });

    expect(competitionAttempts).toBe(2);
    const facts = normalize(raw);
    expect(facts.seasons[0]?.clubs[0]?.players.length).toBeGreaterThan(0);
  });

  it("opens the circuit only after retry budget is exhausted and stops further GETs", async () => {
    let networkCalls = 0;
    const adapter = createKaderFetchAdapter({
      ...FAST_LIVE_FETCH,
      retryMaxAttempts: 3,
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

    expect(networkCalls).toBe(3);
  });
});

describe("kader fetch adapter rate limiting", () => {
  it("stops further Transfermarkt GETs after consecutive HTTP 403 responses", async () => {
    let networkCalls = 0;
    const adapter = createKaderFetchAdapter({
      ...FAST_LIVE_FETCH,
      retryMaxAttempts: 1,
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
      ...FAST_LIVE_FETCH,
      retryMaxAttempts: 1,
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
      ...FAST_LIVE_FETCH,
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

  it("stops Transfermarkt GETs after consecutive 403/429 and still returns runSeed summary", async () => {
    await prepareDatabase();
    let networkCalls = 0;
    const fixturesAdapter = createKaderFetchAdapter({ fixturesDir });
    const rateLimited = createKaderFetchAdapter({
      ...FAST_LIVE_FETCH,
      retryMaxAttempts: 1,
      rateLimitStopAfter: 1,
      fetchHtml: async (url) => {
        networkCalls += 1;
        throw new TransfermarktHttpError(403, url);
      },
    });
    const adapter = {
      fetchLeague: fixturesAdapter.fetchLeague.bind(fixturesAdapter),
      fetchLeagueSeason: fixturesAdapter.fetchLeagueSeason.bind(fixturesAdapter),
      listClubSeasonPairs: fixturesAdapter.listClubSeasonPairs.bind(fixturesAdapter),
      fetchClub: fixturesAdapter.fetchClub.bind(fixturesAdapter),
      fetchClubSeason: rateLimited.fetchClubSeason.bind(rateLimited),
    };

    const result = await runSeed({
      scope: {
        kind: "competition",
        competition: "superligaen",
        fromSeason: "2015",
        toSeason: "2015",
      },
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    expect(networkCalls).toBe(1);
    expect(result.summary.fetched).toBe(0);
    expect(result.summary.failures).toHaveLength(2);
    expect(result.summary.failures[0]?.error).toMatch(/403/);
    expect(result.summary.failures[1]?.error).toMatch(/consecutive HTTP 403\/429/);
    expect(result.summary.mapped).toBe(0);
  });
});
