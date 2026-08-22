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
    expect(() => assertSeedProxyAvailable({ requireProxy: true, proxyUrl: undefined })).toThrow(
      /SEED_REQUIRE_PROXY is set but SEED_PROXY_URL is missing/,
    );
  });
});

describe("createProxyFetchHtml", () => {
  it("routes GETs through the configured proxy agent", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => "<html>ok</html>",
    });

    const { fetchHtml } = createProxyFetchHtml("http://proxy.example:8080");
    const html = await fetchHtml("https://www.transfermarkt.com/test");

    expect(html).toBe("<html>ok</html>");
    expect(ProxyAgentMock).toHaveBeenCalledWith("http://proxy.example:8080");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.transfermarkt.com/test",
      expect.objectContaining({
        dispatcher: expect.objectContaining({ kind: "proxy-agent" }),
        headers: expect.objectContaining({
          "User-Agent": expect.stringContaining("KitCollective-Seed"),
        }),
      }),
    );
  });

  it("uses Site Unblocker TLS skip and geo header without a custom User-Agent", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => "<html>ok</html>",
    });

    const unblockerUrl = "http://user:pass@unblock.decodo.com:60000";
    const { fetchHtml } = createProxyFetchHtml(unblockerUrl);
    await fetchHtml("https://www.transfermarkt.com/test");

    expect(ProxyAgentMock).toHaveBeenCalledWith({
      uri: unblockerUrl,
      requestTls: { rejectUnauthorized: false },
      proxyTls: { rejectUnauthorized: false },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.transfermarkt.com/test",
      expect.objectContaining({
        headers: {
          "X-SU-Geo": "Germany",
          "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
        },
      }),
    );
  });

  it("drains the response body before throwing on non-OK", async () => {
    const textMock = vi.fn().mockResolvedValue("");
    fetchMock.mockResolvedValue({
      ok: false,
      status: 202,
      text: textMock,
    });

    const { fetchHtml } = createProxyFetchHtml("http://proxy.example:8080");
    await expect(fetchHtml("https://www.transfermarkt.com/test")).rejects.toThrow(
      /Transfermarkt HTTP 202/,
    );
    expect(textMock).toHaveBeenCalled();
  });

  it("closes the proxy agent when close is called", async () => {
    const closeMock = vi.fn().mockResolvedValue(undefined);
    ProxyAgentMock.mockImplementation(() => ({
      kind: "proxy-agent",
      close: closeMock,
    }));

    const { close } = createProxyFetchHtml("http://proxy.example:8080");
    await close();
    expect(closeMock).toHaveBeenCalled();
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
    expect(adapter.adapter.fetchClubSeason).toBeTypeOf("function");
  });

  it("accepts live kader when SEED_PROXY_URL is set", async () => {
    delete process.env.SEED_APIFY_FIXTURE;
    delete process.env.SEED_KADER_HTML;
    delete process.env.SEED_FETCH;
    delete process.env.SEED_REQUIRE_PROXY;
    process.env.SEED_PROXY_URL = "http://proxy.example:8080";

    const closeMock = vi.fn().mockResolvedValue(undefined);
    ProxyAgentMock.mockImplementation(() => ({
      kind: "proxy-agent",
      close: closeMock,
    }));

    const resolved = await resolveFetchAdapter();
    expect(resolved.adapter.fetchClubSeason).toBeTypeOf("function");
    expect(resolved.close).toBeTypeOf("function");
    await resolved.close?.();
    expect(closeMock).toHaveBeenCalled();
  });
});
