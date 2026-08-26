import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createKaderHtmlLiveCache,
  resolveKaderHtmlCacheKey,
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
