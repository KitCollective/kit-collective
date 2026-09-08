import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createKaderFetchAdapter } from "../src/fetch/kader-fetch-adapter.js";
import {
  isTransfermarktProxyQuotaError,
  TransfermarktHttpError,
  TransfermarktProxyQuotaError,
  transfermarktProxyQuotaReason,
} from "../src/fetch/transfermarkt-errors.js";
import { classifyTransfermarktFailure } from "../src/fetch/transfermarkt-fetch-policy.js";
import {
  createTransfermarktRateLimitGuard,
  TransfermarktCircuitOpenError,
} from "../src/fetch/transfermarkt-rate-limit.js";
import { createProxyFetchHtml } from "../src/proxy-config.js";
import { resolveFetchAdapter } from "../src/resolve-fetch-adapter.js";

const ORIGINAL_ENV = { ...process.env };

/**
 * Every test here must hold with the network unplugged. Any real socket is a bug in the
 * test, so `undici` is never reached: the proxy transport takes an injected fetch and the
 * adapter takes an injected `fetchHtml`.
 */
beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  for (const name of [
    "SEED_APIFY_FIXTURE",
    "SEED_KADER_HTML",
    "SEED_APIFY_RECORDINGS",
    "APIFY_TOKEN",
    "SEED_FETCH",
    "SEED_TM_TRANSPORT",
    "SEED_PROXY_URL",
    "SEED_REQUIRE_PROXY",
  ]) {
    delete process.env[name];
  }
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

const UNBLOCKER_URL = "http://user:pass@unblock.decodo.com:60000";
const PAGE_HTML = `<html>${"squad".repeat(2_000)}</html>`;
const KADER_URL = "https://www.transfermarkt.com/-/kader/verein/190/saison_id/2010/plus/1";

function proxyDoubles() {
  return {
    fetchMock: vi.fn(),
    createProxyAgent: vi.fn(() => ({ kind: "proxy-agent", close: vi.fn() })),
  };
}

function quotaResponse(status: number, body: string) {
  return { ok: false, status, text: async () => body };
}

describe("a live run without a named transport", () => {
  it("refuses instead of walking Transfermarkt from this machine's IP", async () => {
    await expect(resolveFetchAdapter()).rejects.toThrow(
      /Refusing to fetch from this machine's IP by default/,
    );
  });

  it("still refuses when the Site Unblocker knobs are set but the URL is not", async () => {
    process.env.SEED_PROXY_GEO = "Germany";
    process.env.SEED_PROXY_HEADLESS = "html";

    await expect(resolveFetchAdapter()).rejects.toThrow(/SEED_PROXY_URL is missing/);
  });

  it("goes direct only when the operator names it, and says so", async () => {
    process.env.SEED_TM_TRANSPORT = "direct";

    const resolved = await resolveFetchAdapter();
    expect(resolved.transport).toBe("direct");
    await resolved.close?.();
  });

  it("reports the proxy transport when SEED_PROXY_URL is set", async () => {
    process.env.SEED_PROXY_URL = "http://proxy.example:8080";

    const resolved = await resolveFetchAdapter();
    expect(resolved.transport).toBe("proxy");
    await resolved.close?.();
  });

  it("leaves offline adapters alone — they never touch the transport policy", async () => {
    process.env.SEED_KADER_HTML = "/tmp/kader-html";

    const resolved = await resolveFetchAdapter();
    expect(resolved.transport).toBe("fixture");
    expect(resolved.close).toBeUndefined();
  });
});

describe("a live adapter built without a transport", () => {
  it("throws on the first GET instead of opening its own direct session", async () => {
    const adapter = createKaderFetchAdapter({ requestDelayMs: 0 });

    await expect(adapter.fetchPlayerJerseyNumbers("28003")).rejects.toThrow(
      /needs an explicit fetchHtml for live mode/,
    );
  });
});

describe("a spent Site Unblocker plan", () => {
  it.each([
    [402, "Payment Required"],
    [429, '{"error":"Quota exceeded for this subscription"}'],
    [403, "traffic limit reached for your plan"],
    [407, "Proxy Authentication Required"],
    [429, "You have no traffic left on this plan"],
  ])("is a quota refusal, not a Transfermarkt block (HTTP %i)", async (status, body) => {
    const { fetchMock, createProxyAgent } = proxyDoubles();
    fetchMock.mockResolvedValue(quotaResponse(status, body));

    const { fetchHtml } = createProxyFetchHtml(UNBLOCKER_URL, fetchMock, createProxyAgent, {
      geo: "Germany",
      render: "auto",
    });

    await expect(fetchHtml(KADER_URL)).rejects.toBeInstanceOf(TransfermarktProxyQuotaError);
  });

  it("does not spend a second, rendered pass on the same URL", async () => {
    const { fetchMock, createProxyAgent } = proxyDoubles();
    fetchMock.mockResolvedValue(quotaResponse(402, "Payment Required"));

    const { fetchHtml } = createProxyFetchHtml(UNBLOCKER_URL, fetchMock, createProxyAgent, {
      geo: "Germany",
      render: "auto",
    });

    await expect(fetchHtml(KADER_URL)).rejects.toBeInstanceOf(TransfermarktProxyQuotaError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is fatal, so the retry loop never re-sends it", () => {
    expect(
      classifyTransfermarktFailure(new TransfermarktProxyQuotaError(402, KADER_URL, "quota")),
    ).toBe("fatal");
  });

  it("keeps a plain Transfermarkt 429 retryable — that one is worth another try", () => {
    expect(classifyTransfermarktFailure(new TransfermarktHttpError(429, KADER_URL))).toBe(
      "retryable",
    );
  });

  it("opens the circuit on the first refusal instead of after a burst", async () => {
    const inner = vi.fn(async () => {
      throw new TransfermarktProxyQuotaError(402, KADER_URL, "payment required");
    });
    const guard = createTransfermarktRateLimitGuard(inner, { stopAfter: 8 });

    await expect(guard.fetchHtml(KADER_URL)).rejects.toBeInstanceOf(TransfermarktProxyQuotaError);
    expect(guard.isOpen()).toBe(true);

    await expect(guard.fetchHtml(KADER_URL)).rejects.toBeInstanceOf(TransfermarktCircuitOpenError);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it("costs one request per run, not maxAttempts x stopAfter", async () => {
    const { fetchMock, createProxyAgent } = proxyDoubles();
    fetchMock.mockResolvedValue(quotaResponse(402, "Payment Required"));
    const { fetchHtml } = createProxyFetchHtml(UNBLOCKER_URL, fetchMock, createProxyAgent, {
      geo: "Germany",
      render: "auto",
    });

    const adapter = createKaderFetchAdapter({
      fetchHtml,
      fetchBytes: async () => {
        throw new Error("portrait bytes must not be fetched after a quota refusal");
      },
      requestDelayMs: 0,
      sleep: async () => undefined,
    });

    await expect(adapter.fetchPlayerJerseyNumbers("28003")).rejects.toBeInstanceOf(
      TransfermarktProxyQuotaError,
    );
    await expect(adapter.fetchPlayerJerseyNumbers("28004")).rejects.toBeInstanceOf(
      TransfermarktCircuitOpenError,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never falls back to a direct GET after the proxy refuses", async () => {
    const { fetchMock, createProxyAgent } = proxyDoubles();
    fetchMock.mockResolvedValue(quotaResponse(402, "Payment Required"));
    const { fetchHtml } = createProxyFetchHtml(UNBLOCKER_URL, fetchMock, createProxyAgent, {
      geo: "Germany",
      render: "auto",
    });

    const adapter = createKaderFetchAdapter({
      fetchHtml,
      fetchBytes: async () => new Uint8Array(),
      requestDelayMs: 0,
      sleep: async () => undefined,
    });

    await expect(adapter.fetchPlayerJerseyNumbers("28003")).rejects.toThrow();

    // Every URL the run touched went to the injected proxy transport and nowhere else.
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as { dispatcher?: { kind?: string } };
      expect(init.dispatcher?.kind).toBe("proxy-agent");
    }
  });
});

describe("transfermarktProxyQuotaReason", () => {
  it("does not read a real page as a quota refusal", () => {
    expect(transfermarktProxyQuotaReason(200, PAGE_HTML)).toBeUndefined();
  });

  it("leaves an ordinary 429 to the block path when the body says nothing about quota", () => {
    expect(transfermarktProxyQuotaReason(429, "<html>Too Many Requests</html>")).toBeUndefined();
  });

  it("does not treat a WAF interstitial as quota", () => {
    expect(
      transfermarktProxyQuotaReason(202, "<script>window.awsWafCookieDomainList = [];</script>"),
    ).toBeUndefined();
  });

  it("recognises the error object through the shared predicate", () => {
    expect(isTransfermarktProxyQuotaError(new TransfermarktProxyQuotaError(402, "u", "r"))).toBe(
      true,
    );
    expect(isTransfermarktProxyQuotaError(new TransfermarktHttpError(402, "u"))).toBe(false);
  });
});

/**
 * Portrait `src` is vendor-controlled and the bytes path is the one connection that stays
 * direct by design (ADR-0043). A src pointing back at the WAF'd site would be a bare GET
 * from our IP in the middle of an otherwise proxied run.
 */
describe("portrait bytes on the direct connection", () => {
  const competitionHtml = readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../fixtures/kader-html/competitions/DK1-2015.html",
    ),
    "utf8",
  );

  function kaderHtml(portraitSrc: string): string {
    return `<table class="items"><tbody><tr>
      <td class="zentriert">7</td>
      <td>
        <img src="data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=="
             data-src="${portraitSrc}" class="bilderrahmen-fixed lazy lazy" alt="" />
        <table class="inline-table"><tr><td><a href="/johan/profil/spieler/24404">Johan Wiland</a></td></tr>
        <tr><td>Goalkeeper</td></tr></table>
      </td>
    </tr></tbody></table>`;
  }

  async function bytesRequestedFor(portraitSrc: string): Promise<string[]> {
    const requested: string[] = [];
    const adapter = createKaderFetchAdapter({
      requestDelayMs: 0,
      retryBaseDelayMs: 0,
      fetchHtml: async (url) => {
        if (url.includes("/wettbewerb/")) {
          return competitionHtml;
        }
        if (url.includes("/verein/190/")) {
          return kaderHtml(portraitSrc);
        }
        throw new Error(`unexpected live fetch: ${url}`);
      },
      fetchBytes: async (url) => {
        requested.push(url);
        return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
      },
    });

    await adapter.fetchClubSeason({
      competition: "superligaen",
      clubExternalId: "190",
      season: "2015/16",
    });
    return requested;
  }

  it("downloads a portrait from the image CDN", async () => {
    expect(
      await bytesRequestedFor("https://img.a.transfermarkt.technology/portrait/big/24404.jpg"),
    ).toEqual(["https://img.a.transfermarkt.technology/portrait/big/24404.jpg"]);
  });

  it.each([
    "https://www.transfermarkt.com/-/profil/spieler/24404",
    "https://www.transfermarkt.com/images/portrait/24404.jpg",
    "https://transfermarkt.com/images/portrait/24404.jpg",
    "https://img.a.transfermarkt.technology.evil.test/portrait/24404.jpg",
  ])("takes a portrait hole rather than a direct GET to %s", async (src) => {
    expect(await bytesRequestedFor(src)).toEqual([]);
  });
});
