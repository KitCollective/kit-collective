import type { FetchAdapter } from "./fetch/adapter.js";
import { createApifyFetchAdapter, createLiveApifyFetchAdapter } from "./fetch/apify-adapter.js";
import { createFixtureFetchAdapter } from "./fetch/fixture-adapter.js";
import { createKaderFetchAdapter } from "./fetch/kader-fetch-adapter.js";
import {
  DEFAULT_TRANSFERMARKT_REQUEST_DELAY_MS,
  DEFAULT_TRANSFERMARKT_RETRY_BASE_DELAY_MS,
  DEFAULT_TRANSFERMARKT_RETRY_MAX_ATTEMPTS,
  parsePositiveIntEnv,
} from "./fetch/transfermarkt-fetch-policy.js";
import { DEFAULT_TRANSFERMARKT_RATE_LIMIT_STOP_AFTER } from "./fetch/transfermarkt-rate-limit.js";
import {
  assertSeedProxyAvailable,
  createProxyFetchHtml,
  resolveSeedProxyConfig,
} from "./proxy-config.js";

function resolveKaderFetchPolicyFromEnv(env: NodeJS.ProcessEnv = process.env) {
  return {
    requestDelayMs: parsePositiveIntEnv(
      env.SEED_TRANSFERMARKT_REQUEST_DELAY_MS,
      DEFAULT_TRANSFERMARKT_REQUEST_DELAY_MS,
    ),
    retryMaxAttempts: Math.max(
      1,
      parsePositiveIntEnv(
        env.SEED_TRANSFERMARKT_RETRY_MAX_ATTEMPTS,
        DEFAULT_TRANSFERMARKT_RETRY_MAX_ATTEMPTS,
      ),
    ),
    retryBaseDelayMs: parsePositiveIntEnv(
      env.SEED_TRANSFERMARKT_RETRY_BASE_DELAY_MS,
      DEFAULT_TRANSFERMARKT_RETRY_BASE_DELAY_MS,
    ),
    rateLimitStopAfter: Math.max(
      1,
      parsePositiveIntEnv(
        env.SEED_TRANSFERMARKT_RATE_LIMIT_STOP_AFTER,
        DEFAULT_TRANSFERMARKT_RATE_LIMIT_STOP_AFTER,
      ),
    ),
  };
}

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
  const kaderFetchPolicy = resolveKaderFetchPolicyFromEnv();

  if (proxyConfig.proxyUrl) {
    const { fetchHtml, close } = createProxyFetchHtml(proxyConfig.proxyUrl);
    return {
      adapter: createKaderFetchAdapter({
        fetchHtml,
        cacheDir: kaderCacheDir,
        ...kaderFetchPolicy,
      }),
      close,
    };
  }

  return {
    adapter: createKaderFetchAdapter({
      cacheDir: kaderCacheDir,
      ...kaderFetchPolicy,
    }),
  };
}
