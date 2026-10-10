#!/usr/bin/env node
import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createFkListingIngestRunner, type FkListingIngestRunner } from "./listing-ingest.js";
import { createFkListingKitSource, type FkListingKitSource } from "./listing-kit-source.js";
import { parseFkListingKitsQuery } from "./listing-query.js";

export const FK_LISTING_HEALTH_PATH = "/health";
export const FK_LISTING_KITS_PATH = "/kits";
export const FK_LISTING_INGEST_PATH = "/ingest";
export const FOOTBALL_KIT_ARCHIVE_ORIGIN = "https://www.footballkitarchive.com";

export type FkListingHttpOptions = {
  env?: NodeJS.ProcessEnv;
  loadKits?: FkListingKitSource;
  runIngest?: FkListingIngestRunner;
};

function requestPath(req: IncomingMessage): string {
  try {
    return new URL(req.url ?? "/", "http://127.0.0.1").pathname;
  } catch {
    return "/";
  }
}

function requestUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? "/", "http://127.0.0.1");
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(body)}\n`);
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function bearerMatches(header: string | undefined, expected: string): boolean {
  const prefix = "Bearer ";
  if (!header?.startsWith(prefix)) {
    return false;
  }
  const got = Buffer.from(header.slice(prefix.length));
  const want = Buffer.from(expected);
  if (got.length !== want.length) {
    return false;
  }
  return timingSafeEqual(got, want);
}

export async function handleFkListingHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: FkListingHttpOptions = {},
): Promise<void> {
  const env = options.env ?? process.env;
  const path = requestPath(req);
  const method = req.method ?? "GET";
  const loadKits = options.loadKits ?? createFkListingKitSource();

  if (method === "GET" && path === FK_LISTING_HEALTH_PATH) {
    json(res, 200, { ok: true });
    return;
  }

  if (method === "GET" && path === FK_LISTING_KITS_PATH) {
    const parsed = parseFkListingKitsQuery(requestUrl(req).searchParams);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error });
      return;
    }

    const loaded = await loadKits(parsed.scope);
    if (!loaded.ok) {
      json(res, 502, {
        error: loaded.error,
        scope: parsed.scope,
      });
      return;
    }

    json(res, 200, { kits: loaded.kits });
    return;
  }

  if (method === "POST" && path === FK_LISTING_INGEST_PATH) {
    const expected = env.FK_LISTING_INGEST_TOKEN?.trim();
    if (!expected) {
      json(res, 503, { error: "FK listing ingest requires FK_LISTING_INGEST_TOKEN" });
      return;
    }
    if (!bearerMatches(headerValue(req.headers.authorization), expected)) {
      json(res, 401, { error: "Unauthorized" });
      return;
    }

    const url = requestUrl(req);
    const parsed = parseFkListingKitsQuery(url.searchParams);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error });
      return;
    }

    const clubLabel = url.searchParams.get("clubLabel")?.trim() || undefined;
    const loaded = await loadKits(parsed.scope, { clubLabel });
    if (!loaded.ok) {
      json(res, 502, {
        error: loaded.error,
        scope: parsed.scope,
      });
      return;
    }

    const ingest = options.runIngest ?? createFkListingIngestRunner({ env });
    try {
      const result = await ingest({ scope: parsed.scope, kits: loaded.kits });
      json(res, 200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "FK listing ingest failed";
      const status =
        message.includes("DATABASE_URL") || message.includes("R2 credentials") ? 503 : 500;
      json(res, status, { error: message });
    }
    return;
  }

  res.writeHead(404);
  res.end();
}

export function startFkListingHttpServer(
  options: FkListingHttpOptions = {},
): ReturnType<typeof createServer> {
  const env = options.env ?? process.env;
  const resolved: FkListingHttpOptions = {
    ...options,
    env,
    loadKits: options.loadKits ?? createFkListingKitSource(),
  };
  const httpServer = createServer((req, res) => {
    void handleFkListingHttpRequest(req, res, resolved);
  });
  httpServer.requestTimeout = 0;
  httpServer.headersTimeout = 0;
  httpServer.timeout = 0;
  const port = Number(env.PORT ?? "8787");
  const host = env.FK_LISTING_BIND ?? "0.0.0.0";
  httpServer.listen(port, host, () => {
    process.stderr.write(`FK listing HTTP listening on ${host}:${port}\n`);
  });
  return httpServer;
}

function main(): void {
  startFkListingHttpServer({ env: process.env });
}

const isDirectRun =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main();
}
