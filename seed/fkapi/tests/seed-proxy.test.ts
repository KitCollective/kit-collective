import { afterEach, describe, expect, it, vi } from "vitest";

import { createFkApiFetchAdapter } from "../src/fetch.js";
import {
  assertSeedProxyAvailable,
  createSeedHttpFetch,
  resolveSeedProxyConfig,
} from "../src/proxy-config.js";
import { runCli } from "../src/run.js";
import type { ObjectStoreAdapter } from "../src/types.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function createProxyDoubles() {
  const fetchMock = vi.fn();
  const createProxyAgent = vi.fn(() => ({ kind: "proxy-agent" }));
  return { fetchMock, createProxyAgent };
}

describe("resolveSeedProxyConfig", () => {
  it("returns no proxy by default", () => {
    expect(resolveSeedProxyConfig({})).toEqual({
      proxyUrl: undefined,
      requireProxy: false,
    });
  });

  it("reads SEED_PROXY_URL and SEED_REQUIRE_PROXY", () => {
    expect(
      resolveSeedProxyConfig({
        SEED_PROXY_URL: "http://user:pass@proxy.example:8080",
        SEED_REQUIRE_PROXY: "true",
      }),
    ).toEqual({
      proxyUrl: "http://user:pass@proxy.example:8080",
      requireProxy: true,
    });
  });
});

describe("assertSeedProxyAvailable", () => {
  it("allows live fetch when proxy is not required", () => {
    expect(() =>
      assertSeedProxyAvailable({ requireProxy: false, proxyUrl: undefined }),
    ).not.toThrow();
  });

  it("fails closed when proxy is required but missing", () => {
    expect(() => assertSeedProxyAvailable({ requireProxy: true, proxyUrl: undefined })).toThrow(
      /SEED_REQUIRE_PROXY is set but SEED_PROXY_URL is missing/,
    );
  });
});

describe("createSeedHttpFetch", () => {
  it("routes GETs through the configured proxy agent", async () => {
    const { fetchMock, createProxyAgent } = createProxyDoubles();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ kits: [] }),
    });

    const httpFetch = createSeedHttpFetch(
      {
        proxyUrl: "http://proxy.example:8080",
        requireProxy: true,
      },
      fetchMock,
      createProxyAgent,
    );
    await httpFetch("https://fkapi.example.invalid/kits");

    expect(createProxyAgent).toHaveBeenCalledWith("http://proxy.example:8080");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://fkapi.example.invalid/kits",
      expect.objectContaining({
        dispatcher: { kind: "proxy-agent" },
      }),
    );
  });
});

describe("createFkApiFetchAdapter", () => {
  it("downloads imageUrl bytes when listings omit inline imageBytes", async () => {
    const { fetchMock, createProxyAgent } = createProxyDoubles();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          kits: [
            {
              id: "fk-img",
              clubTransfermarktId: "190",
              seasonTransfermarktId: "DK1-1998",
              seasonLabel: "1998/99",
              type: "home",
              imageUrl: "https://archive.example/kit.jpg",
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Uint8Array.from([255, 216, 255]).buffer,
      });

    const adapter = createFkApiFetchAdapter({
      baseUrl: "https://fkapi.example.invalid",
      httpFetch: createSeedHttpFetch({ requireProxy: false }, fetchMock, createProxyAgent),
    });

    const kits = await adapter.fetchKits({
      kind: "competition",
      competition: "superliga",
      fromSeason: "1998/99",
      toSeason: "1998/99",
    });

    expect(kits).toHaveLength(1);
    expect(kits[0]?.imageBytes).toEqual(Uint8Array.from([255, 216, 255]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(createProxyAgent).not.toHaveBeenCalled();
  });

  it("requests club and season query params for club scope without competition range", async () => {
    const { fetchMock, createProxyAgent } = createProxyDoubles();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ kits: [] }),
    });

    const adapter = createFkApiFetchAdapter({
      baseUrl: "https://fkapi.example.invalid",
      httpFetch: createSeedHttpFetch({ requireProxy: false }, fetchMock, createProxyAgent),
    });

    await adapter.fetchKits({
      kind: "club",
      competition: "superliga",
      clubExternalId: "club-190",
      season: "2010/11",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://fkapi.example.invalid/kits?clubTransfermarktId=190&season=2010%2F11",
      expect.any(Object),
    );
  });

  it("requests resolved nationalTeamFkApiId and season for national-team fetch scope", async () => {
    const { fetchMock, createProxyAgent } = createProxyDoubles();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ kits: [] }),
    });

    const adapter = createFkApiFetchAdapter({
      baseUrl: "https://fkapi.example.invalid",
      httpFetch: createSeedHttpFetch({ requireProxy: false }, fetchMock, createProxyAgent),
    });

    await adapter.fetchKits({
      kind: "national_team",
      nationalTeamRef: "fka-denmark",
      season: "2010",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://fkapi.example.invalid/kits?nationalTeamFkApiId=fka-denmark&season=2010",
      expect.any(Object),
    );
  });

  it("drops national-team kits whose FKA team id is not the resolved scope", async () => {
    const { fetchMock, createProxyAgent } = createProxyDoubles();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        kits: [
          {
            id: "fk-nt-keep",
            nationalTeamFkApiId: "fka-denmark",
            seasonTransfermarktId: "WC-2010",
            seasonLabel: "2010",
            type: "home",
            imageBytes: [255, 216, 255],
          },
          {
            id: "fk-nt-other",
            nationalTeamFkApiId: "fka-sweden",
            seasonTransfermarktId: "WC-2010",
            seasonLabel: "2010",
            type: "home",
            imageBytes: [255, 216, 255],
          },
        ],
      }),
    });

    const adapter = createFkApiFetchAdapter({
      baseUrl: "https://fkapi.example.invalid",
      httpFetch: createSeedHttpFetch({ requireProxy: false }, fetchMock, createProxyAgent),
    });

    const kits = await adapter.fetchKits({
      kind: "national_team",
      nationalTeamRef: "fka-denmark",
      season: "2010",
    });

    expect(kits.map((kit) => kit.id)).toEqual(["fk-nt-keep"]);
  });

  it("default live adapter does not construct a proxy agent when SEED_PROXY_* is set", async () => {
    process.env.SEED_PROXY_URL = "http://user:pass@proxy.example:8080";
    process.env.SEED_REQUIRE_PROXY = "true";
    const { fetchMock, createProxyAgent } = createProxyDoubles();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ kits: [] }),
    });

    const adapter = createFkApiFetchAdapter({
      baseUrl: "https://fkapi.example.invalid",
      httpFetcher: fetchMock,
      createProxyAgent,
    });
    await adapter.fetchKits({
      kind: "national_team",
      nationalTeamRef: "fka-denmark",
      season: "2010",
    });

    expect(createProxyAgent).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://fkapi.example.invalid/kits?nationalTeamFkApiId=fka-denmark&season=2010",
      expect.objectContaining({ dispatcher: undefined }),
    );
  });
});

describe("runCli live FK fetch", () => {
  it("does not refuse national-team CLI when SEED_REQUIRE_PROXY is set without SEED_PROXY_URL", async () => {
    process.env.FKAPI_BASE_URL = "https://fkapi.example.invalid";
    process.env.SEED_REQUIRE_PROXY = "true";
    delete process.env.SEED_PROXY_URL;

    const objectStore: ObjectStoreAdapter = {
      async putObject() {},
      async objectExists() {
        return true;
      },
    };

    let message = "";
    try {
      await runCli({
        argv: ["national-team", "3436", "2010", "development"],
        databaseUrl: "postgresql://unused",
        objectStore,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).not.toMatch(/SEED_REQUIRE_PROXY/);
    expect(message.length).toBeGreaterThan(0);
  });
});
