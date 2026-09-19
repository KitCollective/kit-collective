import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { competitionSearchUrl } from "../src/fetch/competition-search.js";
import {
  clubFactsUrl,
  clubHonoursUrl,
  competitionSeasonUrl,
  kaderUrl,
  playerJerseyNumbersUrl,
  playerProfileUrl,
} from "../src/fetch/kader-fetch-adapter.js";
import {
  createKaderBytesLiveCache,
  createKaderHtmlLiveCache,
  resolveKaderAssetCacheKey,
  resolveKaderHtmlCacheKey,
  wrapFetchBytesWithKaderCache,
  wrapFetchHtmlWithKaderCache,
} from "../src/fetch/kader-html-live-cache.js";

describe("resolveKaderHtmlCacheKey", () => {
  it("maps competition season URLs to competition cache paths", () => {
    expect(
      resolveKaderHtmlCacheKey(
        "https://www.transfermarkt.com/superligaen/startseite/wettbewerb/DK1/saison_id/2015",
      ),
    ).toEqual({
      kind: "competition",
      relativePath: path.join("competitions", "DK1-2015.html"),
    });
  });

  it("maps kader plus/1 URLs to club-season cache paths", () => {
    expect(
      resolveKaderHtmlCacheKey(
        "https://www.transfermarkt.com/-/kader/verein/190/saison_id/2015/plus/1",
      ),
    ).toEqual({
      kind: "kader",
      relativePath: path.join("kader", "190-2015.html"),
    });
  });

  it("maps player profile URLs to profile cache paths", () => {
    expect(
      resolveKaderHtmlCacheKey("https://www.transfermarkt.com/-/profil/spieler/99999"),
    ).toEqual({
      kind: "profile",
      relativePath: path.join("profiles", "player-99999.html"),
    });
  });

  it("maps club facts and honours URLs so a club grain refetches nothing", () => {
    expect(
      resolveKaderHtmlCacheKey("https://www.transfermarkt.com/-/datenfakten/verein/190"),
    ).toEqual({
      kind: "facts",
      relativePath: path.join("facts", "190.html"),
    });
    expect(resolveKaderHtmlCacheKey("https://www.transfermarkt.com/-/erfolge/verein/190")).toEqual({
      kind: "honours",
      relativePath: path.join("honours", "190.html"),
    });
  });

  it("maps the competition search page", () => {
    const key = resolveKaderHtmlCacheKey(
      "https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=premier+league",
    );
    expect(key?.kind).toBe("search");
    expect(key?.relativePath.startsWith(path.join("search", ""))).toBe(true);
  });

  it("has no key for an unrelated URL", () => {
    expect(resolveKaderHtmlCacheKey("https://www.transfermarkt.com/")).toBeUndefined();
  });
});

/**
 * Transfermarkt addresses every page about a player as `/<section>/spieler/<id>`, so the id
 * alone does not identify a page. A loose `/spieler/(\d+)` fallback filed player honours
 * under the profile name — the second source fetched would have overwritten the first in a
 * cache we cannot cheaply refill.
 */
describe("resolveKaderHtmlCacheKey player sections", () => {
  const PLAYER_ID = "28003";

  /** Every `/spieler/` section Transfermarkt serves that a grain could plausibly want. */
  const PLAYER_SECTIONS = [
    "profil",
    "rueckennummern",
    "erfolge",
    "leistungsdaten",
    "leistungsdatendetails",
    "transfers",
    "verletzungen",
    "nationalmannschaft",
    "marktwertverlauf",
    "alletore",
    "elfmeter",
    "sperren",
  ];

  function playerUrl(section: string): string {
    return `https://www.transfermarkt.com/-/${section}/spieler/${PLAYER_ID}`;
  }

  it("keeps player honours off the profile key", () => {
    const profile = resolveKaderHtmlCacheKey(playerUrl("profil"));
    const honours = resolveKaderHtmlCacheKey(playerUrl("erfolge"));

    expect(profile?.kind).toBe("profile");
    expect(honours?.kind).toBe("player_honours");
    expect(honours?.relativePath).not.toBe(profile?.relativePath);
  });

  it("gives every player section its own path for the same player", () => {
    const byPath = new Map<string, string>();

    for (const section of PLAYER_SECTIONS) {
      const key = resolveKaderHtmlCacheKey(playerUrl(section));
      expect(key, `no cache key for /${section}/spieler/`).toBeDefined();

      const collidesWith = byPath.get(key?.relativePath ?? "");
      expect(
        collidesWith,
        `/${section}/spieler/ shares a cache path with /${collidesWith}/spieler/`,
      ).toBeUndefined();
      byPath.set(key?.relativePath ?? "", section);
    }

    expect(byPath.size).toBe(PLAYER_SECTIONS.length);
  });

  it("namespaces an unrecognised section instead of borrowing the profile key", () => {
    const key = resolveKaderHtmlCacheKey(playerUrl("einsaetze"));

    expect(key?.kind).toBe("player_page");
    expect(key?.relativePath).toBe(path.join("players", "einsaetze", `player-${PLAYER_ID}.html`));
  });

  it("keeps the established directories for the sources already on disk", () => {
    expect(resolveKaderHtmlCacheKey(playerUrl("profil"))?.relativePath).toBe(
      path.join("profiles", `player-${PLAYER_ID}.html`),
    );
    expect(resolveKaderHtmlCacheKey(playerUrl("rueckennummern"))?.relativePath).toBe(
      path.join("jersey-numbers", `player-${PLAYER_ID}.html`),
    );
  });

  it("separates two players inside the same section", () => {
    expect(resolveKaderHtmlCacheKey(playerUrl("erfolge"))?.relativePath).not.toBe(
      resolveKaderHtmlCacheKey("https://www.transfermarkt.com/-/erfolge/spieler/99999")
        ?.relativePath,
    );
  });

  it("does not confuse a player section with the club section of the same name", () => {
    expect(resolveKaderHtmlCacheKey(playerUrl("erfolge"))?.relativePath).not.toBe(
      resolveKaderHtmlCacheKey(`https://www.transfermarkt.com/-/erfolge/verein/${PLAYER_ID}`)
        ?.relativePath,
    );
  });
});

describe("resolveKaderHtmlCacheKey club sections", () => {
  const CLUB_ID = "190";

  const CLUB_SECTIONS = [
    "datenfakten",
    "erfolge",
    "kader",
    "startseite",
    "spielplan",
    "leistungsdaten",
    "transfers",
    "stadion",
  ];

  function clubUrl(section: string, season?: number): string {
    const suffix = season === undefined ? "" : `/saison_id/${season}`;
    return `https://www.transfermarkt.com/-/${section}/verein/${CLUB_ID}${suffix}`;
  }

  it("keeps the club season homepage off the kader key", () => {
    const kader = resolveKaderHtmlCacheKey(`${clubUrl("kader", 2010)}/plus/1`);
    const homepage = resolveKaderHtmlCacheKey(clubUrl("startseite", 2010));

    expect(kader?.kind).toBe("kader");
    expect(kader?.relativePath).toBe(path.join("kader", `${CLUB_ID}-2010.html`));
    expect(homepage?.kind).toBe("club_page");
    expect(homepage?.relativePath).not.toBe(kader?.relativePath);
  });

  it("gives every club section its own path for the same club and season", () => {
    const byPath = new Map<string, string>();

    for (const section of CLUB_SECTIONS) {
      for (const season of [undefined, 2010]) {
        const key = resolveKaderHtmlCacheKey(clubUrl(section, season));
        expect(key, `no cache key for /${section}/verein/`).toBeDefined();

        const label = `${section}${season === undefined ? "" : `@${season}`}`;
        const collidesWith = byPath.get(key?.relativePath ?? "");
        expect(collidesWith, `${label} shares a cache path with ${collidesWith}`).toBeUndefined();
        byPath.set(key?.relativePath ?? "", label);
      }
    }
  });

  it("keeps the established directories for the sources already on disk", () => {
    expect(resolveKaderHtmlCacheKey(clubUrl("datenfakten"))?.relativePath).toBe(
      path.join("facts", `${CLUB_ID}.html`),
    );
    expect(resolveKaderHtmlCacheKey(clubUrl("erfolge"))?.relativePath).toBe(
      path.join("honours", `${CLUB_ID}.html`),
    );
  });

  it("keeps a club season apart from the same club in another season", () => {
    expect(resolveKaderHtmlCacheKey(clubUrl("spielplan", 2010))?.relativePath).not.toBe(
      resolveKaderHtmlCacheKey(clubUrl("spielplan", 2011))?.relativePath,
    );
  });
});

/**
 * The regression guard: every URL this codebase actually builds must land on its own key.
 * A new source added with a URL builder but no cache kind fails here rather than silently
 * overwriting an existing page.
 */
describe("cache keys for the URLs the seed actually fetches", () => {
  it("assigns a distinct key to every builder", () => {
    const urls: Record<string, string> = {
      competitionSeason: competitionSeasonUrl("DK1", 2010, "superligaen"),
      kader: kaderUrl("190", 2010),
      playerProfile: playerProfileUrl("28003"),
      playerJerseyNumbers: playerJerseyNumbersUrl("28003"),
      clubFacts: clubFactsUrl("190"),
      clubHonours: clubHonoursUrl("190"),
      competitionSearch: competitionSearchUrl("Premier League"),
      // Not wired to a fetcher yet, but CONTEXT.md names it as Player Honours.
      playerHonours: "https://www.transfermarkt.com/-/erfolge/spieler/28003",
    };

    const byPath = new Map<string, string>();
    for (const [name, url] of Object.entries(urls)) {
      const key = resolveKaderHtmlCacheKey(url);
      expect(key, `${name} (${url}) has no cache key`).toBeDefined();

      const collidesWith = byPath.get(key?.relativePath ?? "");
      expect(collidesWith, `${name} shares a cache path with ${collidesWith}`).toBeUndefined();
      byPath.set(key?.relativePath ?? "", name);
    }

    expect(byPath.size).toBe(Object.keys(urls).length);
  });

  it("fails when a new /spieler/ URL builder is added without its own named cache kind", async () => {
    const srcRoot = path.join(import.meta.dirname, "../src");
    const files: string[] = [];

    async function walk(dir: string): Promise<void> {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.name.endsWith(".ts")) {
          files.push(full);
        }
      }
    }

    await walk(srcRoot);

    const found = new Set<string>();
    const urlRe = /https:\/\/www\.transfermarkt\.[^`"'\\\s]*?\/([A-Za-z0-9_-]+)\/spieler\//g;
    for (const file of files) {
      const text = await readFile(file, "utf8");
      for (const match of text.matchAll(urlRe)) {
        const section = match[1];
        if (section) {
          found.add(section.toLowerCase());
        }
      }
    }

    // Adding a builder must update this list *and* land on a named kind below, not
    // the namespaced `player_page` fallback. That fallback exists so an unsuspecting
    // new section cannot overwrite `profiles/` — it is not a license to skip a kind.
    expect([...found].sort()).toEqual(["profil", "rueckennummern"]);

    const keys = [...found].map((section) => {
      const key = resolveKaderHtmlCacheKey(
        `https://www.transfermarkt.com/-/${section}/spieler/28003`,
      );
      expect(key, `/${section}/spieler/ has no cache key`).toBeDefined();
      expect(key?.kind, `/${section}/spieler/ fell through to the unnamespaced fallback`).not.toBe(
        "player_page",
      );
      return key?.relativePath;
    });

    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("resolveKaderAssetCacheKey", () => {
  it("keys portrait bytes by URL and keeps the image extension", () => {
    const key = resolveKaderAssetCacheKey(
      "https://img.a.transfermarkt.technology/portrait/big/28003-1671435885.jpg?lm=1",
    );
    expect(key?.kind).toBe("asset");
    expect(key?.relativePath).toMatch(/^assets[/\\][0-9a-f]{16}\.jpg$/);
  });

  it("is stable for the same URL and different for another", () => {
    const first = resolveKaderAssetCacheKey("https://img.example.test/a.png");
    const again = resolveKaderAssetCacheKey("https://img.example.test/a.png");
    const other = resolveKaderAssetCacheKey("https://img.example.test/b.png");

    expect(first).toEqual(again);
    expect(first?.relativePath).not.toBe(other?.relativePath);
  });

  it("has no key for a relative src", () => {
    expect(resolveKaderAssetCacheKey("/images/portrait.jpg")).toBeUndefined();
  });
});

describe("wrapFetchBytesWithKaderCache", () => {
  it("writes portrait bytes to disk and serves the second read from cache", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "kader-assets-"));
    const cache = createKaderBytesLiveCache(cacheDir);
    const url = "https://img.a.transfermarkt.technology/portrait/big/28003.jpg";
    let networkCalls = 0;

    const fetchBytes = wrapFetchBytesWithKaderCache(async () => {
      networkCalls += 1;
      return new Uint8Array([7, 8, 9]);
    }, cache);

    expect(await fetchBytes(url)).toEqual(new Uint8Array([7, 8, 9]));
    expect(await fetchBytes(url)).toEqual(new Uint8Array([7, 8, 9]));
    expect(networkCalls).toBe(1);
  });
});

describe("wrapFetchHtmlWithKaderCache", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes HTML to disk and avoids a second network fetch in the same process", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "kader-cache-"));
    const cache = createKaderHtmlLiveCache(cacheDir);
    const url = "https://www.transfermarkt.com/-/kader/verein/190/saison_id/2015/plus/1";
    let networkCalls = 0;

    const fetchHtml = wrapFetchHtmlWithKaderCache(async () => {
      networkCalls += 1;
      return "<html>kader</html>";
    }, cache);

    await fetchHtml(url);
    await fetchHtml(url);

    expect(networkCalls).toBe(1);
    const diskHtml = await readFile(path.join(cacheDir, "kader", "190-2015.html"), "utf8");
    expect(diskHtml).toBe("<html>kader</html>");
  });
});
