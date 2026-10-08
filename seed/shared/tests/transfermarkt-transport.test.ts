import { describe, expect, it } from "vitest";
import { resolveTransfermarktTransport } from "../src/transfermarkt-transport.js";

const PROXY_URL = "http://user:pass@proxy.example:8080";

describe("resolveTransfermarktTransport", () => {
  it("returns direct when SEED_TM_TRANSPORT=direct and ignores SEED_PROXY_URL", () => {
    expect(
      resolveTransfermarktTransport({
        SEED_TM_TRANSPORT: "direct",
        SEED_PROXY_URL: PROXY_URL,
        SEED_REQUIRE_PROXY: "true",
      }),
    ).toEqual({ mode: "direct" });
  });

  it("returns proxy when SEED_TM_TRANSPORT=proxy and SEED_PROXY_URL is set", () => {
    expect(
      resolveTransfermarktTransport({
        SEED_TM_TRANSPORT: "proxy",
        SEED_PROXY_URL: PROXY_URL,
      }),
    ).toEqual({ mode: "proxy", proxyUrl: PROXY_URL });
  });

  it("throws when SEED_TM_TRANSPORT=proxy and SEED_PROXY_URL is missing", () => {
    expect(() => resolveTransfermarktTransport({ SEED_TM_TRANSPORT: "proxy" })).toThrow(
      /SEED_PROXY_URL is missing/,
    );
  });

  it("returns proxy when SEED_REQUIRE_PROXY is truthy and SEED_PROXY_URL is set", () => {
    expect(
      resolveTransfermarktTransport({
        SEED_REQUIRE_PROXY: "true",
        SEED_PROXY_URL: PROXY_URL,
      }),
    ).toEqual({ mode: "proxy", proxyUrl: PROXY_URL });
  });

  it.each(["1", "true", "yes", "on", "TRUE", " Yes "])(
    "treats SEED_REQUIRE_PROXY=%j as truthy",
    (value) => {
      expect(
        resolveTransfermarktTransport({
          SEED_REQUIRE_PROXY: value,
          SEED_PROXY_URL: PROXY_URL,
        }),
      ).toEqual({ mode: "proxy", proxyUrl: PROXY_URL });
    },
  );

  it("fails closed when SEED_REQUIRE_PROXY is truthy and SEED_PROXY_URL is missing", () => {
    expect(() => resolveTransfermarktTransport({ SEED_REQUIRE_PROXY: "true" })).toThrow(
      /SEED_REQUIRE_PROXY is set but SEED_PROXY_URL is missing/,
    );
  });

  it("defaults to proxy whenever SEED_PROXY_URL is configured, Desktop included", () => {
    expect(resolveTransfermarktTransport({ SEED_PROXY_URL: PROXY_URL })).toEqual({
      mode: "proxy",
      proxyUrl: PROXY_URL,
    });
  });

  it("keeps SEED_TM_TRANSPORT=direct as the opt-out from the configured proxy", () => {
    expect(
      resolveTransfermarktTransport({
        SEED_PROXY_URL: PROXY_URL,
        SEED_TM_TRANSPORT: "direct",
      }),
    ).toEqual({ mode: "direct" });
  });

  it("refuses a blank SEED_PROXY_URL rather than reading it as direct", () => {
    expect(() => resolveTransfermarktTransport({ SEED_PROXY_URL: "   " })).toThrow(
      /SEED_PROXY_URL is missing/,
    );
  });

  it("refuses to fetch at all when no transport is configured", () => {
    expect(() => resolveTransfermarktTransport({})).toThrow(
      /Refusing to fetch from this machine's IP by default/,
    );
  });

  it("refuses when the operator forgot --env-file and only unrelated names survive", () => {
    expect(() =>
      resolveTransfermarktTransport({
        // The realistic Desktop miss: SEED_PROXY_URL never reached the process.
        SEED_PROXY_GEO: "Germany",
        SEED_PROXY_HEADLESS: "auto",
        DATABASE_URL: "postgres://lane",
      }),
    ).toThrow(/Refusing to fetch from this machine's IP by default/);
  });

  it("names direct in the refusal so the opt-in is discoverable", () => {
    expect(() => resolveTransfermarktTransport({})).toThrow(/SEED_TM_TRANSPORT=direct/);
  });

  it.each(["proxi", "unblocker", "decodo", "site-unblocker", "false"])(
    "refuses the mistyped SEED_TM_TRANSPORT=%j instead of picking a transport",
    (value) => {
      expect(() =>
        resolveTransfermarktTransport({ SEED_TM_TRANSPORT: value, SEED_PROXY_URL: PROXY_URL }),
      ).toThrow(/is not a transport/);
    },
  );

  it("never returns direct unless direct was asked for by name", () => {
    const envs: Array<Record<string, string | undefined>> = [
      {},
      { SEED_PROXY_URL: "" },
      { SEED_PROXY_URL: "   " },
      { SEED_REQUIRE_PROXY: "false" },
      { SEED_TM_TRANSPORT: "" },
      { SEED_TM_TRANSPORT: "proxy" },
      { SEED_TM_TRANSPORT: "typo" },
      { SEED_PROXY_URL: PROXY_URL },
      { SEED_PROXY_URL: PROXY_URL, SEED_REQUIRE_PROXY: "true" },
    ];

    for (const env of envs) {
      let resolved: ReturnType<typeof resolveTransfermarktTransport> | undefined;
      try {
        resolved = resolveTransfermarktTransport(env);
      } catch {
        resolved = undefined;
      }
      expect(resolved?.mode, `env ${JSON.stringify(env)} resolved to direct`).not.toBe("direct");
    }
  });
});
