import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  createKaderFetchAdapter,
  kaderUrl,
  playerJerseyNumbersUrl,
} from "../src/fetch/kader-fetch-adapter.js";
import { resolveKaderHtmlCacheKey } from "../src/fetch/kader-html-live-cache.js";
import { TransfermarktCircuitOpenError } from "../src/fetch/transfermarkt-rate-limit.js";

const fixturesDir = path.join(import.meta.dirname, "../fixtures/kader-html");

async function seededCacheDir(): Promise<string> {
  const cacheDir = await mkdtemp(path.join(tmpdir(), "kader-cache-hit-"));

  const files: Array<[string, string]> = [
    [
      "https://www.transfermarkt.com/superligaen/startseite/wettbewerb/DK1/saison_id/2015",
      path.join(fixturesDir, "competitions/DK1-2015.html"),
    ],
    [kaderUrl("190", 2015), path.join(fixturesDir, "kader/190-2015.html")],
  ];

  for (const [url, source] of files) {
    const key = resolveKaderHtmlCacheKey(url);
    if (!key) {
      throw new Error(`no cache key for ${url}`);
    }
    const target = path.join(cacheDir, key.relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, await readFile(source, "utf8"), "utf8");
  }

  return cacheDir;
}

/**
 * The cache used to sit inside the pacing wrapper, so a re-run that fetched nothing still
 * slept the full inter-request delay for every URL it read back off disk.
 */
describe("a re-run served entirely from the HTML cache", () => {
  it("costs no network requests and no pacing sleep", async () => {
    const cacheDir = await seededCacheDir();
    const networkUrls: string[] = [];
    const sleeps: number[] = [];

    const adapter = createKaderFetchAdapter({
      cacheDir,
      // Desktop-sized pacing: a cache hit that paid this would be the bug.
      requestDelayMs: 1_500,
      fetchHtml: async (url) => {
        networkUrls.push(url);
        throw new Error(`cache miss reached the network: ${url}`);
      },
      fetchBytes: async (url) => {
        networkUrls.push(url);
        throw new Error(`cache miss reached the network: ${url}`);
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      clock: { now: () => 0 },
    });

    const clubs = await adapter.fetchLeagueSeason({
      competition: "superligaen",
      season: "2015/16",
    });

    expect(clubs.seasons[0]?.clubs.length).toBeGreaterThan(0);
    expect(networkUrls).toEqual([]);
    expect(sleeps).toEqual([]);

    const first = await adapter.fetchClubSeason({
      competition: "superligaen",
      clubExternalId: "190",
      season: "2015/16",
    });
    const second = await adapter.fetchClubSeason({
      competition: "superligaen",
      clubExternalId: "190",
      season: "2015/16",
    });

    expect(first.seasons[0]?.clubs[0]?.players.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
    expect(networkUrls).toEqual([]);
    expect(sleeps).toEqual([]);
  });

  it("still serves the cache after the circuit opened", async () => {
    const cacheDir = await seededCacheDir();
    const adapter = createKaderFetchAdapter({
      cacheDir,
      requestDelayMs: 0,
      rateLimitStopAfter: 1,
      retryMaxAttempts: 1,
      sleep: async () => undefined,
      fetchHtml: async () => {
        throw new TransfermarktCircuitOpenError();
      },
      fetchBytes: async () => new Uint8Array(),
    });

    // An uncached player page is refused...
    await expect(adapter.fetchPlayerJerseyNumbers("99999")).rejects.toThrow();

    // ...while the cached competition page still answers, because reading disk is not a GET.
    const clubs = await adapter.fetchLeagueSeason({
      competition: "superligaen",
      season: "2015/16",
    });
    expect(clubs.seasons[0]?.clubs.length).toBeGreaterThan(0);
  });

  it("keys the cached jersey-numbers page apart from the profile page", () => {
    expect(resolveKaderHtmlCacheKey(playerJerseyNumbersUrl("28003"))?.relativePath).not.toBe(
      resolveKaderHtmlCacheKey("https://www.transfermarkt.com/-/profil/spieler/28003")
        ?.relativePath,
    );
  });
});

const LIVE_CACHE = path.join(import.meta.dirname, "../.cache/transfermarkt");
const LIVE_KADER_2012 = path.join(LIVE_CACHE, "kader", "190-2012.html");
const LIVE_COMPETITION_2012 = path.join(LIVE_CACHE, "competitions", "DK1-2012.html");

/**
 * Proof against the Desktop HTML cache (not fixtures). Skips in CI, where that
 * directory is absent. A cache miss here must throw rather than open a socket —
 * the Site Unblocker plan is spent.
 */
describe("FC Copenhagen 2012/13 served from the live HTML cache", () => {
  it.skipIf(!existsSync(LIVE_KADER_2012) || !existsSync(LIVE_COMPETITION_2012))(
    "costs no network requests, no pacing sleep, and is idempotent",
    async () => {
      const networkUrls: string[] = [];
      const sleeps: number[] = [];

      const adapter = createKaderFetchAdapter({
        cacheDir: LIVE_CACHE,
        requestDelayMs: 1_500,
        fetchHtml: async (url) => {
          networkUrls.push(url);
          throw new Error(`cache miss reached the network: ${url}`);
        },
        fetchBytes: async (url) => {
          networkUrls.push(url);
          throw new Error(`cache miss reached the network: ${url}`);
        },
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        clock: { now: () => 0 },
      });

      const first = await adapter.fetchClubSeason({
        competition: "superligaen",
        clubExternalId: "190",
        season: "2012/13",
      });
      const second = await adapter.fetchClubSeason({
        competition: "superligaen",
        clubExternalId: "190",
        season: "2012/13",
      });

      const players = first.seasons[0]?.clubs[0]?.players ?? [];
      expect(players.length).toBeGreaterThan(0);
      expect(second).toEqual(first);
      expect(networkUrls).toEqual([]);
      expect(sleeps).toEqual([]);

      const playerId = players.find((row) => row.id)?.id;
      if (
        playerId &&
        existsSync(path.join(LIVE_CACHE, "jersey-numbers", `player-${playerId}.html`))
      ) {
        await adapter.fetchPlayerJerseyNumbers(playerId);
        expect(networkUrls).toEqual([]);
        expect(sleeps).toEqual([]);
      }
    },
  );
});
