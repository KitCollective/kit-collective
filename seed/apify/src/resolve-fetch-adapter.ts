import path from "node:path";
import { resolveTransfermarktTransport } from "@kit/seed-shared";
import type { CatalogMarksFetcher, FetchAdapter, JerseyNumbersFetcher } from "./fetch/adapter.js";
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
import { createTransfermarktSession } from "./fetch/transfermarkt-session.js";
import { createProxyFetchHtml } from "./proxy-config.js";

/** Cache is on by default: a re-run should cost Transfermarkt nothing. */
export const DEFAULT_KADER_CACHE_DIR = "seed/apify/.cache/transfermarkt";

export function resolveKaderCacheDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.SEED_KADER_CACHE?.trim() || DEFAULT_KADER_CACHE_DIR;
}

/**
 * Through Site Unblocker, Transfermarkt never sees our IP and Decodo's own edge advertises
 * `ratelimit-limit: 200`, so the pacing that protects a direct laptop IP only slows bulk down.
 */
export const DEFAULT_PROXY_TRANSFERMARKT_REQUEST_DELAY_MS = 250;

export function resolveKaderFetchPolicyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  transportMode: "direct" | "proxy" = "direct",
) {
  return {
    requestDelayMs: parsePositiveIntEnv(
      env.SEED_TRANSFERMARKT_REQUEST_DELAY_MS,
      transportMode === "proxy"
        ? DEFAULT_PROXY_TRANSFERMARKT_REQUEST_DELAY_MS
        : DEFAULT_TRANSFERMARKT_REQUEST_DELAY_MS,
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

/**
 * What actually carries this run. `fixture` and `apify` never reach Transfermarkt, so the
 * transport policy is not consulted for them — reporting the label from here keeps the CLI
 * from re-deriving it and tripping the fail-closed refusal on an offline run.
 */
export type ResolvedTransportLabel = "fixture" | "apify" | "proxy" | "direct";

export interface ResolvedFetchAdapter {
  adapter: FetchAdapter;
  transport: ResolvedTransportLabel;
  /**
   * Present only on the Transfermarkt HTML transports. The Apify actor and the recorded
   * JSON payload adapters have no `/rueckennummern` source to read.
   */
  jerseyNumbers?: JerseyNumbersFetcher;
  catalogMarks?: CatalogMarksFetcher;
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
    return { adapter: createFixtureFetchAdapter(fixturePath), transport: "fixture" };
  }

  if (kaderHtmlDir) {
    const adapter = createKaderFetchAdapter({ fixturesDir: kaderHtmlDir });
    return { adapter, jerseyNumbers: adapter, catalogMarks: adapter, transport: "fixture" };
  }

  if (fetchMode === "apify") {
    if (recordingsDir) {
      return { adapter: createApifyFetchAdapter({ recordingsDir, actorId }), transport: "apify" };
    }
    if (apifyToken) {
      return {
        adapter: createLiveApifyFetchAdapter({ token: apifyToken, actorId }),
        transport: "apify",
      };
    }
    throw new Error(
      "SEED_FETCH=apify requires SEED_APIFY_RECORDINGS (recorded actor datasets) or APIFY_TOKEN (live Apify fetch).",
    );
  }

  const transport = resolveTransfermarktTransport(process.env);
  const kaderCacheDir = resolveKaderCacheDir();
  const kaderFetchPolicy = resolveKaderFetchPolicyFromEnv(process.env, transport.mode);

  const session = createTransfermarktSession({
    cookieFile: path.join(kaderCacheDir, "session-cookies.json"),
  });

  if (transport.mode === "proxy") {
    // Proxy carries the WAF'd HTML; portrait bytes come off the image CDN directly.
    const { fetchHtml, close } = createProxyFetchHtml(transport.proxyUrl);
    const adapter = createKaderFetchAdapter({
      fetchHtml,
      fetchBytes: session.fetchBytes,
      cacheDir: kaderCacheDir,
      ...kaderFetchPolicy,
    });
    return {
      adapter,
      jerseyNumbers: adapter,
      catalogMarks: adapter,
      transport: "proxy",
      close: async () => {
        await close();
        await session.close();
      },
    };
  }

  const adapter = createKaderFetchAdapter({
    fetchHtml: session.fetchHtml,
    fetchBytes: session.fetchBytes,
    cacheDir: kaderCacheDir,
    ...kaderFetchPolicy,
  });
  return {
    adapter,
    jerseyNumbers: adapter,
    catalogMarks: adapter,
    transport: "direct",
    close: session.close,
  };
}
