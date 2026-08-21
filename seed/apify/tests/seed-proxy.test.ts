import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock, ProxyAgentMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  ProxyAgentMock: vi.fn(),
}));

vi.mock("undici", () => ({
  fetch: fetchMock,
  ProxyAgent: ProxyAgentMock,
}));

import {
  assertSeedProxyAvailable,
  createProxyFetchHtml,
  resolveSeedProxyConfig,
} from "../src/proxy-config.js";
import { resolveFetchAdapter } from "../src/resolve-fetch-adapter.js";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  fetchMock.mockReset();
  ProxyAgentMock.mockReset();
  ProxyAgentMock.mockImplementation(() => ({ kind: "proxy-agent" }));
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

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

  it("allows live fetch when proxy is required and present", () => {
    expect(() =>
      assertSeedProxyAvailable({
        requireProxy: true,
        proxyUrl: "http://proxy.example:8080",
      }),
    ).not.toThrow();
  });

  it("fails closed when proxy is required but missing", () => {
    expect(() =>
      assertSeedProxyAvailable({ requireProxy: true, proxyUrl: undefined }),
    ).toThrow(/SEED_REQUIRE_PROXY is set but SEED_PROXY_URL is missing/);
  });
});

describe("createProxyFetchHtml", () => {
  it("routes GETs through the configured proxy agent", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => "<html>ok</html>",
    });

    const fetchHtml = createProxyFetchHtml("http://proxy.example:8080");
    const html = await fetchHtml("https://www.transfermarkt.com/test");

    expect(html).toBe("<html>ok</html>");
    expect(ProxyAgentMock).toHaveBeenCalledWith("http://proxy.example:8080");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.transfermarkt.com/test",
      expect.objectContaining({
        dispatcher: { kind: "proxy-agent" },
        headers: expect.objectContaining({
          "User-Agent": expect.stringContaining("KitCollective-Seed"),
        }),
      }),
    );
  });
});

describe("resolveFetchAdapter proxy behaviour", () => {
  it("fails closed for live kader when SEED_REQUIRE_PROXY is set without SEED_PROXY_URL", async () => {
    delete process.env.SEED_APIFY_FIXTURE;
    delete process.env.SEED_KADER_HTML;
    delete process.env.SEED_FETCH;
    process.env.SEED_REQUIRE_PROXY = "true";
    delete process.env.SEED_PROXY_URL;

    await expect(resolveFetchAdapter()).rejects.toThrow(
      /SEED_REQUIRE_PROXY is set but SEED_PROXY_URL is missing/,
    );
  });

  it("does not require proxy for fixture adapters", async () => {
    process.env.SEED_REQUIRE_PROXY = "true";
    delete process.env.SEED_PROXY_URL;
    process.env.SEED_KADER_HTML = "/tmp/kader-html";

    const adapter = await resolveFetchAdapter();
    expect(adapter.fetchClubSeason).toBeTypeOf("function");
  });

  it("accepts live kader when SEED_PROXY_URL is set", async () => {
    delete process.env.SEED_APIFY_FIXTURE;
    delete process.env.SEED_KADER_HTML;
    delete process.env.SEED_FETCH;
    delete process.env.SEED_REQUIRE_PROXY;
    process.env.SEED_PROXY_URL = "http://proxy.example:8080";

    const adapter = await resolveFetchAdapter();
    expect(adapter.fetchClubSeason).toBeTypeOf("function");
  });
});
