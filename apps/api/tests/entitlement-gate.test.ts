import { afterEach, describe, expect, it } from "vitest";
import { entitlementGateIsOff } from "../src/config/entitlement-gate.js";

describe("entitlementGateIsOff", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("is off only when ENTITLEMENT_GATE=off outside production and staging", () => {
    delete process.env.NODE_ENV;
    process.env.ENTITLEMENT_GATE = "off";

    expect(entitlementGateIsOff()).toBe(true);
  });

  it("stays on when the flag is unset", () => {
    delete process.env.NODE_ENV;
    delete process.env.ENTITLEMENT_GATE;

    expect(entitlementGateIsOff()).toBe(false);
  });

  it("ignores the flag in production", () => {
    process.env.NODE_ENV = "production";
    process.env.ENTITLEMENT_GATE = "off";

    expect(entitlementGateIsOff()).toBe(false);
  });

  it("ignores the flag in staging", () => {
    process.env.NODE_ENV = "staging";
    process.env.ENTITLEMENT_GATE = "off";

    expect(entitlementGateIsOff()).toBe(false);
  });
});
