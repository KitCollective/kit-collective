import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const undiciMocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  ProxyAgent: vi.fn(function ProxyAgent() {
    return { kind: "proxy-agent" };
  }),
}));

vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof import("undici")>();
  return {
    ...actual,
    fetch: undiciMocks.fetch,
    ProxyAgent: undiciMocks.ProxyAgent,
  };
});

import { createFkApiFetchAdapter } from "../src/fetch.js";
import { runCli } from "../src/run.js";
import type { ObjectStoreAdapter } from "../src/types.js";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  undiciMocks.fetch.mockReset();
  undiciMocks.ProxyAgent.mockClear();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("live FK fetch (no Seed proxy)", () => {
  it("default adapter fetches national-team kits without a ProxyAgent even when SEED_PROXY_* is set", async () => {
    process.env.SEED_PROXY_URL = "http://user:pass@proxy.example:8080";
    process.env.SEED_REQUIRE_PROXY = "true";
    undiciMocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ kits: [] }),
    });

    const adapter = createFkApiFetchAdapter({
      baseUrl: "https://fkapi.example.invalid",
    });
    await adapter.fetchKits({
      kind: "national_team",
      nationalTeamRef: "fka-denmark",
      season: "2010",
    });

    expect(undiciMocks.ProxyAgent).not.toHaveBeenCalled();
    expect(undiciMocks.fetch).toHaveBeenCalledWith(
      "https://fkapi.example.invalid/kits?nationalTeamFkApiId=fka-denmark&season=2010",
      expect.objectContaining({ dispatcher: undefined }),
    );
  });

  it("runCli default adapter does not fail closed on SEED_REQUIRE_PROXY for national-team", async () => {
    process.env.FKAPI_BASE_URL = "https://fkapi.example.invalid";
    process.env.SEED_REQUIRE_PROXY = "true";
    delete process.env.SEED_PROXY_URL;
    undiciMocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ kits: [] }),
    });

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
    expect(undiciMocks.ProxyAgent).not.toHaveBeenCalled();
  });
});
