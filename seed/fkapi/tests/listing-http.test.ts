import { once } from "node:events";
import { readFileSync } from "node:fs";
import type { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { startFkListingHttpServer } from "../src/listing-http.js";
import type { FkListingKitSource } from "../src/listing-kit-source.js";
import { parseFkListingKitsQuery } from "../src/listing-query.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function readRepo(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

async function listeningPort(server: ReturnType<typeof createServer>): Promise<number> {
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected TCP listen address");
  }
  return address.port;
}

describe("FK listing kits query", () => {
  it("fails closed without identity params", () => {
    const parsed = parseFkListingKitsQuery(new URLSearchParams());
    expect(parsed.ok).toBe(false);
  });

  it("parses clubTransfermarktId + season", () => {
    const parsed = parseFkListingKitsQuery(
      new URLSearchParams({ clubTransfermarktId: "190", season: "2010/11" }),
    );
    expect(parsed).toEqual({
      ok: true,
      scope: {
        kind: "club",
        competition: "superligaen",
        clubExternalId: "190",
        season: "2010/11",
      },
    });
  });
});

describe("FK listing HTTP", () => {
  it("GET /health returns 200", async () => {
    const server = startFkListingHttpServer({
      env: { PORT: "0", FK_LISTING_BIND: "127.0.0.1" },
    });
    try {
      const port = await listeningPort(server);
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    } finally {
      server.close();
    }
  });

  it("disables Node’s 5-minute request timeout so Wayback ingest can finish", async () => {
    const server = startFkListingHttpServer({
      env: { PORT: "0", FK_LISTING_BIND: "127.0.0.1" },
    });
    try {
      await listeningPort(server);
      expect(server.requestTimeout).toBe(0);
      expect(server.headersTimeout).toBe(0);
    } finally {
      server.close();
    }
  });

  it("GET /kits without query returns 400 not empty kits", async () => {
    const server = startFkListingHttpServer({
      env: { PORT: "0", FK_LISTING_BIND: "127.0.0.1" },
    });
    try {
      const port = await listeningPort(server);
      const response = await fetch(`http://127.0.0.1:${port}/kits`);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({
        error:
          "kits query requires clubTransfermarktId+season, nationalTeamFkApiId+season, or competition+from+to",
      });
    } finally {
      server.close();
    }
  });

  it("GET /kits fails closed when the kit source cannot load live kits", async () => {
    const loadKits: FkListingKitSource = async () => ({
      ok: false,
      error: "Wayback has no Football Kit Archive kit snapshot for this scope",
    });
    const server = startFkListingHttpServer({
      env: { PORT: "0", FK_LISTING_BIND: "127.0.0.1" },
      loadKits,
    });
    try {
      const port = await listeningPort(server);
      const response = await fetch(
        `http://127.0.0.1:${port}/kits?clubTransfermarktId=190&season=2010%2F11`,
      );
      expect(response.status).toBe(502);
      const body = await response.json();
      expect(body).toEqual({
        error: "Wayback has no Football Kit Archive kit snapshot for this scope",
        scope: {
          kind: "club",
          competition: "superligaen",
          clubExternalId: "190",
          season: "2010/11",
        },
      });
    } finally {
      server.close();
    }
  });

  it("GET /kits returns kit JSON when the kit source loads", async () => {
    const loadKits: FkListingKitSource = async () => ({
      ok: true,
      kits: [
        {
          id: "fc-copenhagen-2010-11-home-kit",
          clubTransfermarktId: "190",
          seasonTransfermarktId: "2010/11",
          seasonLabel: "2010/11",
          type: "home",
          manufacturerName: "Kappa",
          sponsorName: "Carlsberg",
          imageUrl:
            "https://web.archive.org/web/20230813082833id_/https://cdn.footballkitarchive.com/2021/07/04/6BRVH8Hy1F8md50.jpg",
        },
      ],
    });
    const server = startFkListingHttpServer({
      env: { PORT: "0", FK_LISTING_BIND: "127.0.0.1" },
      loadKits,
    });
    try {
      const port = await listeningPort(server);
      const response = await fetch(
        `http://127.0.0.1:${port}/kits?clubTransfermarktId=190&season=2010%2F11`,
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({
        kits: [
          {
            id: "fc-copenhagen-2010-11-home-kit",
            clubTransfermarktId: "190",
            seasonTransfermarktId: "2010/11",
            seasonLabel: "2010/11",
            type: "home",
            manufacturerName: "Kappa",
            sponsorName: "Carlsberg",
            imageUrl:
              "https://web.archive.org/web/20230813082833id_/https://cdn.footballkitarchive.com/2021/07/04/6BRVH8Hy1F8md50.jpg",
          },
        ],
      });
    } finally {
      server.close();
    }
  });
});

describe("Coolify FK listing host", () => {
  it("is a 24/7 listing HTTP service, not the one-shot FK job", () => {
    const compose = readRepo("seed/coolify/docker-compose.fk-listing.yml");
    const job = readRepo("seed/coolify/docker-compose.fkapi-job.yml");
    const dockerfile = readRepo("seed/coolify/Dockerfile.fk-listing");
    const wire = readRepo("seed/coolify/wire-fk-listing.sh");

    expect(compose).toMatch(/restart:\s*unless-stopped/);
    expect(compose).toMatch(/seed\/fkapi\/dist\/listing-http\.js/);
    expect(compose).not.toMatch(/^\s+SEED_PROXY_URL:/m);
    expect(compose).not.toMatch(/^\s+COOLIFY_/m);
    expect(job).toMatch(/restart:\s*"no"/);
    expect(job).not.toMatch(/listing-http/);
    expect(job).not.toMatch(/SEED_PROXY_URL/);
    expect(job).not.toMatch(/SEED_REQUIRE_PROXY/);
    expect(dockerfile).toMatch(
      /CMD\s*\[["']node["']\s*,\s*["']seed\/fkapi\/dist\/listing-http\.js["']\]/,
    );
    expect(wire).toMatch(/SEED_LANE:-development/);
    expect(wire).toMatch(/production is refused/);
    expect(wire).not.toMatch(/\{key: "SEED_PROXY_URL"/);
    expect(readRepo("seed/fkapi/src/listing-kit-source.ts")).toMatch(/web\.archive\.org/);
    expect(readRepo("seed/fkapi/src/listing-http.ts")).not.toMatch(/SEED_PROXY_URL/);
    expect(readRepo("seed/fkapi/src/listing-http.ts")).toMatch(/FK_LISTING_INGEST_TOKEN/);
    expect(compose).toMatch(/DATABASE_URL/);
    expect(compose).toMatch(/R2_ENDPOINT/);
    expect(compose).toMatch(/FK_LISTING_INGEST_TOKEN/);
    expect(compose).not.toMatch(/^\s+DATABASE_URL:/m);
    expect(compose).not.toMatch(/^\s+FK_LISTING_INGEST_TOKEN:/m);
    expect(compose).not.toMatch(/^\s+FK_LIVE_BROWSER:/m);
    expect(readRepo("seed/fkapi/src/listing-kit-source.ts")).not.toMatch(
      /listing-live-playwright|connectOverCDP|FK_LIVE_BROWSER/,
    );
  });
});

describe("FK listing ingest HTTP", () => {
  const sampleKits = [
    {
      id: "fc-copenhagen-2010-11-home-kit",
      clubTransfermarktId: "190",
      seasonTransfermarktId: "2010/11",
      seasonLabel: "2010/11",
      type: "home",
      manufacturerName: "Kappa",
    },
  ];

  it("POST /ingest without a bearer returns 401 when a token is configured", async () => {
    const server = startFkListingHttpServer({
      env: {
        PORT: "0",
        FK_LISTING_BIND: "127.0.0.1",
        FK_LISTING_INGEST_TOKEN: "ingest-secret",
      },
    });
    try {
      const port = await listeningPort(server);
      const response = await fetch(
        `http://127.0.0.1:${port}/ingest?clubTransfermarktId=190&season=2010%2F11`,
        { method: "POST" },
      );
      expect(response.status).toBe(401);
    } finally {
      server.close();
    }
  });

  it("POST /ingest without FK_LISTING_INGEST_TOKEN returns 503", async () => {
    const server = startFkListingHttpServer({
      env: { PORT: "0", FK_LISTING_BIND: "127.0.0.1" },
    });
    try {
      const port = await listeningPort(server);
      const response = await fetch(
        `http://127.0.0.1:${port}/ingest?clubTransfermarktId=190&season=2010%2F11`,
        { method: "POST", headers: { authorization: "Bearer ingest-secret" } },
      );
      expect(response.status).toBe(503);
    } finally {
      server.close();
    }
  });

  it("POST /ingest fails closed when the kit source cannot load live kits", async () => {
    const loadKits: FkListingKitSource = async () => ({
      ok: false,
      error: "no Football Kit Archive slug for clubTransfermarktId=99999",
    });
    const server = startFkListingHttpServer({
      env: {
        PORT: "0",
        FK_LISTING_BIND: "127.0.0.1",
        FK_LISTING_INGEST_TOKEN: "ingest-secret",
      },
      loadKits,
      runIngest: async () => {
        throw new Error("must not ingest");
      },
    });
    try {
      const port = await listeningPort(server);
      const response = await fetch(
        `http://127.0.0.1:${port}/ingest?clubTransfermarktId=99999&season=2010%2F11`,
        { method: "POST", headers: { authorization: "Bearer ingest-secret" } },
      );
      expect(response.status).toBe(502);
      const body = await response.json();
      expect(body).toEqual({
        error: "no Football Kit Archive slug for clubTransfermarktId=99999",
        scope: {
          kind: "club",
          competition: "superligaen",
          clubExternalId: "99999",
          season: "2010/11",
        },
      });
    } finally {
      server.close();
    }
  });

  it("POST /ingest runs the mapper for the club season scope", async () => {
    const loadKits: FkListingKitSource = async () => ({
      ok: true,
      kits: sampleKits,
    });
    let ingested: { clubExternalId?: string; season?: string; kitIds: string[] } | undefined;
    const server = startFkListingHttpServer({
      env: {
        PORT: "0",
        FK_LISTING_BIND: "127.0.0.1",
        FK_LISTING_INGEST_TOKEN: "ingest-secret",
      },
      loadKits,
      runIngest: async ({ scope, kits }) => {
        ingested = {
          clubExternalId: scope.kind === "club" ? scope.clubExternalId : undefined,
          season: scope.kind === "club" ? scope.season : undefined,
          kitIds: kits.map((kit) => kit.id),
        };
        return { kitsUpserted: kits.length, photosWritten: 0 };
      },
    });
    try {
      const port = await listeningPort(server);
      const response = await fetch(
        `http://127.0.0.1:${port}/ingest?clubTransfermarktId=190&season=2010%2F11&clubLabel=FC%20Copenhagen`,
        { method: "POST", headers: { authorization: "Bearer ingest-secret" } },
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ kitsUpserted: 1, photosWritten: 0 });
      expect(ingested).toEqual({
        clubExternalId: "190",
        season: "2010/11",
        kitIds: ["fc-copenhagen-2010-11-home-kit"],
      });
    } finally {
      server.close();
    }
  });
});
