import { describe, expect, it } from "vitest";
import { resolvePremiumAccessIntent } from "../src/premium/premium-access";

describe("resolvePremiumAccessIntent", () => {
  it("returns live when entitlement is active", () => {
    expect(
      resolvePremiumAccessIntent({
        live: true,
        source: "trial",
        expires: "2026-09-02T12:00:00.000Z",
        trialUsed: true,
      }),
    ).toBe("live");
  });

  it("returns trial_eligible before trial is used", () => {
    expect(
      resolvePremiumAccessIntent({
        live: false,
        source: null,
        expires: null,
        trialUsed: false,
      }),
    ).toBe("trial_eligible");
  });

  it("returns paywall when trial was used and entitlement is inactive", () => {
    expect(
      resolvePremiumAccessIntent({
        live: false,
        source: null,
        expires: null,
        trialUsed: true,
      }),
    ).toBe("paywall");
  });
});
