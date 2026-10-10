import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createKaderFetchAdapter } from "../src/fetch/kader-fetch-adapter.js";
import {
  isPlaceholderPortraitBytes,
  isPlaceholderPortraitUrl,
} from "../src/fetch/portrait-placeholder.js";
import { normalize } from "../src/normalize/index.js";

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/kader-html",
);

/** The silhouette Transfermarkt actually served during the bulk run. */
const PLACEHOLDER_BYTES = new Uint8Array(
  readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../fixtures/portraits/transfermarkt-default-silhouette.webp",
    ),
  ),
);

const PLACEHOLDER_URL =
  "https://img.a.transfermarkt.technology/portrait/medium/default.jpg?lm=4711";
const REAL_PORTRAIT_URL =
  "https://img.a.transfermarkt.technology/portrait/medium/s_24404_190_2013_10_09_1.jpg?lm=4711";

const FAST_LIVE_FETCH = { requestDelayMs: 0, retryBaseDelayMs: 0 } as const;

function kaderHtml(portraitSrc: string): string {
  return `<table class="items"><tbody><tr>
    <td class="zentriert">7</td>
    <td>
      <img src="data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=="
           data-src="${portraitSrc}" class="bilderrahmen-fixed lazy lazy" alt="" />
      <table class="inline-table"><tr><td><a href="/johan/profil/spieler/24404">Johan Wiland</a></td></tr>
      <tr><td>Goalkeeper</td></tr></table>
    </td>
  </tr></tbody></table>`;
}

async function fetchOnePlayer(portraitSrc: string, portraitBytes: Uint8Array) {
  const competitionHtml = readFileSync(
    path.join(fixturesDir, "competitions/DK1-2015.html"),
    "utf8",
  );
  const assetFetches: string[] = [];

  const adapter = createKaderFetchAdapter({
    ...FAST_LIVE_FETCH,
    fetchHtml: async (url) => {
      if (url.includes("/wettbewerb/")) {
        return competitionHtml;
      }
      if (url.includes("/verein/190/")) {
        return kaderHtml(portraitSrc);
      }
      throw new Error(`unexpected live fetch: ${url}`);
    },
    fetchBytes: async (url) => {
      assetFetches.push(url);
      return portraitBytes;
    },
  });

  const raw = await adapter.fetchClubSeason({
    competition: "superligaen",
    clubExternalId: "190",
    season: "2015/16",
  });

  return { assetFetches, players: normalize(raw).seasons[0]?.clubs[0]?.players ?? [] };
}

describe("isPlaceholderPortraitUrl", () => {
  it("matches the shared default silhouette under any portrait size", () => {
    expect(isPlaceholderPortraitUrl(PLACEHOLDER_URL)).toBe(true);
    expect(
      isPlaceholderPortraitUrl("https://img.a.transfermarkt.technology/portrait/big/default.png"),
    ).toBe(true);
    expect(isPlaceholderPortraitUrl("/portrait/small/default.webp")).toBe(true);
  });

  it("leaves a real portrait URL alone", () => {
    expect(isPlaceholderPortraitUrl(REAL_PORTRAIT_URL)).toBe(false);
    expect(
      isPlaceholderPortraitUrl("https://img.a.transfermarkt.technology/portrait/medium/24404.jpg"),
    ).toBe(false);
    expect(isPlaceholderPortraitUrl("https://img.example.test/default-kit.jpg")).toBe(false);
  });
});

describe("isPlaceholderPortraitBytes", () => {
  it("matches the recorded silhouette bytes", () => {
    expect(isPlaceholderPortraitBytes(PLACEHOLDER_BYTES)).toBe(true);
  });

  it("does not match another image of the same length", () => {
    const sameLength = new Uint8Array(PLACEHOLDER_BYTES);
    sameLength[sameLength.length - 1] = (sameLength[sameLength.length - 1] ?? 0) ^ 0xff;

    expect(sameLength).toHaveLength(PLACEHOLDER_BYTES.length);
    expect(isPlaceholderPortraitBytes(sameLength)).toBe(false);
  });
});

describe("kader fetch adapter placeholder portraits", () => {
  it("skips the download and keeps the player when the src is the default silhouette", async () => {
    const { assetFetches, players } = await fetchOnePlayer(PLACEHOLDER_URL, PLACEHOLDER_BYTES);

    expect(assetFetches).toEqual([]);
    expect(players).toHaveLength(1);
    expect(players[0]?.externalId).toBe("24404");
    expect(players[0]?.portraitBytes).toBeUndefined();
  });

  it("keeps the player without a portrait when a real URL answers with the silhouette", async () => {
    const { assetFetches, players } = await fetchOnePlayer(REAL_PORTRAIT_URL, PLACEHOLDER_BYTES);

    expect(assetFetches).toEqual([REAL_PORTRAIT_URL]);
    expect(players).toHaveLength(1);
    expect(players[0]?.externalId).toBe("24404");
    expect(players[0]?.portraitBytes).toBeUndefined();
  });

  it("still keeps a genuine portrait", async () => {
    const real = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const { players } = await fetchOnePlayer(REAL_PORTRAIT_URL, real);

    expect(players[0]?.portraitBytes).toEqual(real);
  });
});
