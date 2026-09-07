#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFkListingKitsQuery } from "./listing-query.js";

export const FK_LISTING_HEALTH_PATH = "/health";
export const FK_LISTING_KITS_PATH = "/kits";
export const FOOTBALL_KIT_ARCHIVE_ORIGIN = "https://www.footballkitarchive.com";

export type FkListingOriginProbe = (url: string) => Promise<{ status: number }>;

export type FkListingHttpOptions = {
  env?: NodeJS.ProcessEnv;
  probeOrigin?: FkListingOriginProbe;
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

async function defaultProbeOrigin(url: string): Promise<{ status: number }> {
  const response = await fetch(url, { method: "GET", redirect: "manual" });
  return { status: response.status };
}

export async function handleFkListingHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: FkListingHttpOptions = {},
): Promise<void> {
  const probe = options.probeOrigin ?? defaultProbeOrigin;
  const path = requestPath(req);
  const method = req.method ?? "GET";

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

    const origin = await probe(FOOTBALL_KIT_ARCHIVE_ORIGIN);
    if (origin.status !== 200) {
      json(res, 502, {
        error: "Football Kit Archive origin refused (not Decodo). Listing HTTP fails closed.",
        originStatus: origin.status,
        scope: parsed.scope,
      });
      return;
    }

    json(res, 502, {
      error:
        "Football Kit Archive HTML listing parse is not this host’s live path yet. Origin 200 is not kit JSON.",
      scope: parsed.scope,
    });
    return;
  }

  res.writeHead(404);
  res.end();
}

export function startFkListingHttpServer(
  options: FkListingHttpOptions = {},
): ReturnType<typeof createServer> {
  const env = options.env ?? process.env;
  const httpServer = createServer((req, res) => {
    void handleFkListingHttpRequest(req, res, options);
  });
  const port = Number(env.PORT ?? "8787");
  const host = env.FK_LISTING_BIND ?? "0.0.0.0";
  httpServer.listen(port, host, () => {
    process.stderr.write(`FK listing HTTP listening on ${host}:${port}\n`);
  });
  return httpServer;
}

function main(): void {
  startFkListingHttpServer();
}

const isDirectRun =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main();
}
