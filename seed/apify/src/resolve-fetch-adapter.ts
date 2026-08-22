import type { FetchAdapter } from "./fetch/adapter.js";
import { createApifyFetchAdapter, createLiveApifyFetchAdapter } from "./fetch/apify-adapter.js";
import { createFixtureFetchAdapter } from "./fetch/fixture-adapter.js";
import { createKaderFetchAdapter } from "./fetch/kader-fetch-adapter.js";
import {
  assertSeedProxyAvailable,
  createProxyFetchHtml,
  resolveSeedProxyConfig,
} from "./proxy-config.js";

export type SeedFetchMode = "kader" | "apify";

export interface ResolvedFetchAdapter {
  adapter: FetchAdapter;
  close?: () => Promise<void>;
}

function resolveFetchMode(): SeedFetchMode {
  const mode = process.env.SEED_FETCH?.trim().toLowerCase();
  if (mode === "apify") {
    return "apify";
  }
  return "kader";
}

export async function resolveFetchAdapter(): Promise<ResolvedFetchAdapter> {
  const fixturePath = process.env.SEED_APIFY_FIXTURE;
  const kaderHtmlDir = process.env.SEED_KADER_HTML;
  const recordingsDir = process.env.SEED_APIFY_RECORDINGS;
  const apifyToken = process.env.APIFY_TOKEN;
  const actorId = process.env.SEED_APIFY_ACTOR_ID;
  const fetchMode = resolveFetchMode();

  if (fixturePath) {
    return { adapter: createFixtureFetchAdapter(fixturePath) };
  }

  if (kaderHtmlDir) {
    return { adapter: createKaderFetchAdapter({ fixturesDir: kaderHtmlDir }) };
  }

  if (fetchMode === "apify") {
    if (recordingsDir) {
      return { adapter: createApifyFetchAdapter({ recordingsDir, actorId }) };
    }
    if (apifyToken) {
      return { adapter: createLiveApifyFetchAdapter({ token: apifyToken, actorId }) };
    }
    throw new Error(
      "SEED_FETCH=apify requires SEED_APIFY_RECORDINGS (recorded actor datasets) or APIFY_TOKEN (live Apify fetch).",
    );
  }

  const proxyConfig = resolveSeedProxyConfig();
  assertSeedProxyAvailable(proxyConfig);

  const kaderCacheDir = process.env.SEED_KADER_CACHE?.trim() || undefined;

  if (proxyConfig.proxyUrl) {
    const { fetchHtml, close } = createProxyFetchHtml(proxyConfig.proxyUrl);
    return {
      adapter: createKaderFetchAdapter({ fetchHtml, cacheDir: kaderCacheDir }),
      close,
    };
  }

  return { adapter: createKaderFetchAdapter({ cacheDir: kaderCacheDir }) };
}
