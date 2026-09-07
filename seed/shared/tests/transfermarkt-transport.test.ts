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

  it("defaults to direct on Desktop even when SEED_PROXY_URL is set", () => {
    expect(resolveTransfermarktTransport({ SEED_PROXY_URL: PROXY_URL })).toEqual({
      mode: "direct",
    });
  });

  it("defaults to direct when env is empty", () => {
    expect(resolveTransfermarktTransport({})).toEqual({ mode: "direct" });
  });
});
