import { once } from "node:events";
import { readFileSync } from "node:fs";
import type { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FOOTBALL_KIT_ARCHIVE_ORIGIN, startFkListingHttpServer } from "../src/listing-http.js";
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
      probeOrigin: async () => ({ status: 403 }),
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

  it("GET /kits without query returns 400 not empty kits", async () => {
    const server = startFkListingHttpServer({
      env: { PORT: "0", FK_LISTING_BIND: "127.0.0.1" },
      probeOrigin: async () => ({ status: 200 }),
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

  it("GET /kits fails closed when Football Kit Archive origin is not 200", async () => {
    const probed: string[] = [];
    const server = startFkListingHttpServer({
      env: { PORT: "0", FK_LISTING_BIND: "127.0.0.1" },
      probeOrigin: async (url) => {
        probed.push(url);
        return { status: 403 };
      },
    });
    try {
      const port = await listeningPort(server);
      const response = await fetch(
        `http://127.0.0.1:${port}/kits?clubTransfermarktId=190&season=2010%2F11`,
      );
      expect(response.status).toBe(502);
      expect(probed).toEqual([FOOTBALL_KIT_ARCHIVE_ORIGIN]);
      const body = await response.json();
      expect(body).toEqual({
        error: "Football Kit Archive origin refused (not Decodo). Listing HTTP fails closed.",
        originStatus: 403,
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
    expect(dockerfile).toMatch(
      /CMD\s*\[["']node["']\s*,\s*["']seed\/fkapi\/dist\/listing-http\.js["']\]/,
    );
    expect(wire).toMatch(/SEED_LANE:-development/);
    expect(wire).toMatch(/production is refused/);
    expect(wire).not.toMatch(/\{key: "SEED_PROXY_URL"/);
  });
});
