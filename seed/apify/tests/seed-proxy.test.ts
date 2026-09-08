import { resolveTransfermarktTransport } from "@kit/seed-shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_TRANSFERMARKT_REQUEST_DELAY_MS } from "../src/fetch/transfermarkt-fetch-policy.js";
import {
  assertSeedProxyAvailable,
  createProxyFetchHtml,
  resolveSeedProxyConfig,
  resolveSiteUnblockerOptions,
  SITE_UNBLOCKER_TIMEOUT_MS,
} from "../src/proxy-config.js";
import {
  DEFAULT_PROXY_TRANSFERMARKT_REQUEST_DELAY_MS,
  resolveFetchAdapter,
  resolveKaderFetchPolicyFromEnv,
} from "../src/resolve-fetch-adapter.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

const UNBLOCKER_URL = "http://user:pass@unblock.decodo.com:60000";

/** Above TRANSFERMARKT_MIN_HTML_BYTES so the thin-relay guard does not fire. */
const PAGE_HTML = `<html>${"squad".repeat(2_000)}</html>`;

function createProxyDoubles() {
  const fetchMock = vi.fn();
  const createProxyAgent = vi.fn(() => ({ kind: "proxy-agent", close: vi.fn() }));
  return { fetchMock, createProxyAgent };
}

function unblockerOptions(overrides: Partial<ReturnType<typeof resolveSiteUnblockerOptions>> = {}) {
  return { geo: "Germany", render: "auto" as const, ...overrides };
}

function headersOfCall(fetchMock: ReturnType<typeof vi.fn>, index: number): Record<string, string> {
  const init = fetchMock.mock.calls[index]?.[1] as { headers: Record<string, string> } | undefined;
  if (!init) {
    throw new Error(`no proxy fetch recorded at call ${index}`);
  }
  return init.headers;
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

describe("resolveSiteUnblockerOptions", () => {
  it("defaults to the German exit with escalation and no sticky session", () => {
    expect(resolveSiteUnblockerOptions({})).toEqual({
      geo: "Germany",
      render: "auto",
      sessionId: undefined,
    });
  });

  it("reads geo, render mode, and sticky session from env", () => {
    expect(
      resolveSiteUnblockerOptions({
        SEED_PROXY_GEO: "Denmark",
        SEED_PROXY_HEADLESS: "html",
        SEED_PROXY_SESSION_ID: "bulk-1",
      }),
    ).toEqual({ geo: "Denmark", render: "html", sessionId: "bulk-1" });
  });

  it("falls back to auto for an unknown render mode", () => {
    expect(resolveSiteUnblockerOptions({ SEED_PROXY_HEADLESS: "browser" }).render).toBe("auto");
  });
});

describe("createProxyFetchHtml", () => {
  it("routes GETs through the configured proxy agent", async () => {
    const { fetchMock, createProxyAgent } = createProxyDoubles();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => PAGE_HTML,
    });

    const { fetchHtml } = createProxyFetchHtml(
      "http://proxy.example:8080",
      fetchMock,
      createProxyAgent,
    );
    const html = await fetchHtml("https://www.transfermarkt.com/test");

    expect(html).toBe(PAGE_HTML);
    expect(createProxyAgent).toHaveBeenCalledWith("http://proxy.example:8080");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.transfermarkt.com/test",
      expect.objectContaining({
        dispatcher: expect.objectContaining({ kind: "proxy-agent" }),
        headers: expect.objectContaining({
          "User-Agent": expect.stringContaining("Mozilla/5.0"),
        }),
      }),
    );
  });

  it("uses Site Unblocker TLS skip, geo header, and a render-sized timeout", async () => {
    const { fetchMock, createProxyAgent } = createProxyDoubles();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => PAGE_HTML,
    });

    const { fetchHtml } = createProxyFetchHtml(
      UNBLOCKER_URL,
      fetchMock,
      createProxyAgent,
      unblockerOptions(),
    );
    await fetchHtml("https://www.transfermarkt.com/test");

    expect(createProxyAgent).toHaveBeenCalledWith({
      uri: UNBLOCKER_URL,
      requestTls: { rejectUnauthorized: false },
      proxyTls: { rejectUnauthorized: false },
      headersTimeout: SITE_UNBLOCKER_TIMEOUT_MS,
      bodyTimeout: SITE_UNBLOCKER_TIMEOUT_MS,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(headersOfCall(fetchMock, 0)).toEqual({
      "X-SU-Geo": "Germany",
      "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    });
  });

  it("escalates to a rendered pass after the WAF answers the cheap pass", async () => {
    const { fetchMock, createProxyAgent } = createProxyDoubles();
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 405,
        text: async () => "<html><script>window.awsWafCookieDomainList = [];</script></html>",
      })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => PAGE_HTML });

    const { fetchHtml } = createProxyFetchHtml(
      UNBLOCKER_URL,
      fetchMock,
      createProxyAgent,
      unblockerOptions(),
    );

    expect(await fetchHtml("https://www.transfermarkt.com/test")).toBe(PAGE_HTML);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(headersOfCall(fetchMock, 0)["X-SU-Headless"]).toBeUndefined();
    expect(headersOfCall(fetchMock, 1)["X-SU-Headless"]).toBe("html");
  });

  it("escalates to a rendered pass after a truncated HTTP 200 relay", async () => {
    const { fetchMock, createProxyAgent } = createProxyDoubles();
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "<html></html>" })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => PAGE_HTML });

    const { fetchHtml } = createProxyFetchHtml(
      UNBLOCKER_URL,
      fetchMock,
      createProxyAgent,
      unblockerOptions(),
    );

    expect(await fetchHtml("https://www.transfermarkt.com/test")).toBe(PAGE_HTML);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports a truncated relay as its own error when rendering does not help", async () => {
    const { fetchMock, createProxyAgent } = createProxyDoubles();
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => "<html></html>" });

    const { fetchHtml } = createProxyFetchHtml(
      UNBLOCKER_URL,
      fetchMock,
      createProxyAgent,
      unblockerOptions(),
    );

    await expect(fetchHtml("https://www.transfermarkt.com/test")).rejects.toThrow(
      /answered 13 bytes .* too small to be a page/,
    );
  });

  it("does not spend a rendered pass on a missing page", async () => {
    const { fetchMock, createProxyAgent } = createProxyDoubles();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => PAGE_HTML,
    });

    const { fetchHtml } = createProxyFetchHtml(
      UNBLOCKER_URL,
      fetchMock,
      createProxyAgent,
      unblockerOptions(),
    );

    await expect(fetchHtml("https://www.transfermarkt.com/test")).rejects.toThrow(
      /Transfermarkt HTTP 404/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders on the first pass when SEED_PROXY_HEADLESS=html", async () => {
    const { fetchMock, createProxyAgent } = createProxyDoubles();
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => PAGE_HTML });

    const { fetchHtml } = createProxyFetchHtml(
      UNBLOCKER_URL,
      fetchMock,
      createProxyAgent,
      unblockerOptions({ render: "html", sessionId: "bulk-1" }),
    );
    await fetchHtml("https://www.transfermarkt.com/test");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(headersOfCall(fetchMock, 0)).toEqual({
      "X-SU-Geo": "Germany",
      "X-SU-Headless": "html",
      "X-SU-Session-Id": "bulk-1",
      "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    });
  });

  it("never renders when SEED_PROXY_HEADLESS=off", async () => {
    const { fetchMock, createProxyAgent } = createProxyDoubles();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 202,
      text: async () => "",
    });

    const { fetchHtml } = createProxyFetchHtml(
      UNBLOCKER_URL,
      fetchMock,
      createProxyAgent,
      unblockerOptions({ render: "off" }),
    );

    await expect(fetchHtml("https://www.transfermarkt.com/test")).rejects.toThrow(
      /AWS WAF challenge \(HTTP 202\)/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("drains the response body before throwing on non-OK", async () => {
    const { fetchMock, createProxyAgent } = createProxyDoubles();
    const textMock = vi.fn().mockResolvedValue(PAGE_HTML);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: textMock,
    });

    const { fetchHtml } = createProxyFetchHtml(
      "http://proxy.example:8080",
      fetchMock,
      createProxyAgent,
    );
    await expect(fetchHtml("https://www.transfermarkt.com/test")).rejects.toThrow(
      /Transfermarkt HTTP 500/,
    );
    expect(textMock).toHaveBeenCalled();
  });

  it("names the WAF gate when the proxy relays HTTP 202", async () => {
    const { fetchMock, createProxyAgent } = createProxyDoubles();
    fetchMock.mockResolvedValue({ ok: false, status: 202, text: async () => "" });

    const { fetchHtml } = createProxyFetchHtml(
      "http://proxy.example:8080",
      fetchMock,
      createProxyAgent,
    );
    await expect(fetchHtml("https://www.transfermarkt.com/test")).rejects.toThrow(
      /AWS WAF challenge \(HTTP 202\)/,
    );
  });

  it("closes the proxy agent when close is called", async () => {
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn();
    const createProxyAgent = vi.fn(() => ({
      kind: "proxy-agent",
      close: closeMock,
    }));

    const { close } = createProxyFetchHtml(
      "http://proxy.example:8080",
      fetchMock,
      createProxyAgent,
    );
    await close();
    expect(closeMock).toHaveBeenCalled();
  });
});

function liveKaderEnv() {
  delete process.env.SEED_APIFY_FIXTURE;
  delete process.env.SEED_KADER_HTML;
  delete process.env.SEED_FETCH;
  delete process.env.SEED_TM_TRANSPORT;
}

describe("resolveFetchAdapter proxy behaviour", () => {
  it("fails closed for live kader when SEED_REQUIRE_PROXY is set without SEED_PROXY_URL", async () => {
    liveKaderEnv();
    process.env.SEED_REQUIRE_PROXY = "true";
    delete process.env.SEED_PROXY_URL;

    await expect(resolveFetchAdapter()).rejects.toThrow(
      /SEED_REQUIRE_PROXY is set but SEED_PROXY_URL is missing/,
    );
  });

  it("fails closed for live kader when SEED_TM_TRANSPORT=proxy without SEED_PROXY_URL", async () => {
    liveKaderEnv();
    process.env.SEED_TM_TRANSPORT = "proxy";
    delete process.env.SEED_PROXY_URL;

    await expect(resolveFetchAdapter()).rejects.toThrow(/SEED_PROXY_URL is missing/);
  });

  it("does not require proxy for fixture adapters", async () => {
    process.env.SEED_REQUIRE_PROXY = "true";
    delete process.env.SEED_PROXY_URL;
    process.env.SEED_KADER_HTML = "/tmp/kader-html";

    const adapter = await resolveFetchAdapter();
    expect(adapter.adapter.fetchClubSeason).toBeTypeOf("function");
    expect(adapter.close).toBeUndefined();
  });

  it("uses proxy close for live kader when Coolify requires a proxy", async () => {
    liveKaderEnv();
    process.env.SEED_REQUIRE_PROXY = "true";
    process.env.SEED_PROXY_URL = "http://proxy.example:8080";

    const resolved = await resolveFetchAdapter();
    expect(resolved.adapter.fetchClubSeason).toBeTypeOf("function");
    expect(resolved.close).toBeTypeOf("function");
    await resolved.close?.();
  });

  it("uses the proxy for live kader whenever SEED_PROXY_URL is set, Desktop included", async () => {
    liveKaderEnv();
    delete process.env.SEED_REQUIRE_PROXY;
    process.env.SEED_PROXY_URL = "http://proxy.example:8080";

    const resolved = await resolveFetchAdapter();
    expect(resolved.adapter.fetchClubSeason).toBeTypeOf("function");
    expect(resolved.close).toBeTypeOf("function");
    await resolved.close?.();
  });

  it("uses proxy close when SEED_TM_TRANSPORT=proxy", async () => {
    liveKaderEnv();
    delete process.env.SEED_REQUIRE_PROXY;
    process.env.SEED_TM_TRANSPORT = "proxy";
    process.env.SEED_PROXY_URL = "http://proxy.example:8080";

    const resolved = await resolveFetchAdapter();
    expect(resolved.close).toBeTypeOf("function");
    await resolved.close?.();
  });

  it("uses direct live kader when SEED_TM_TRANSPORT=direct even if proxy env is set", async () => {
    liveKaderEnv();
    process.env.SEED_TM_TRANSPORT = "direct";
    process.env.SEED_REQUIRE_PROXY = "true";
    process.env.SEED_PROXY_URL = "http://proxy.example:8080";

    // Direct still owns a keep-alive session, so `close` is present either way.
    expect(resolveTransfermarktTransport(process.env)).toEqual({ mode: "direct" });
    const resolved = await resolveFetchAdapter();
    expect(resolved.close).toBeTypeOf("function");
    await resolved.close?.();
  });
});

describe("resolveKaderFetchPolicyFromEnv", () => {
  it("paces direct GETs to protect the laptop IP", () => {
    expect(resolveKaderFetchPolicyFromEnv({}, "direct").requestDelayMs).toBe(
      DEFAULT_TRANSFERMARKT_REQUEST_DELAY_MS,
    );
  });

  it("loosens pacing behind the proxy, which hides our IP", () => {
    expect(resolveKaderFetchPolicyFromEnv({}, "proxy").requestDelayMs).toBe(
      DEFAULT_PROXY_TRANSFERMARKT_REQUEST_DELAY_MS,
    );
  });

  it("lets SEED_TRANSFERMARKT_REQUEST_DELAY_MS win over both defaults", () => {
    expect(
      resolveKaderFetchPolicyFromEnv({ SEED_TRANSFERMARKT_REQUEST_DELAY_MS: "4000" }, "proxy")
        .requestDelayMs,
    ).toBe(4_000);
  });
});
