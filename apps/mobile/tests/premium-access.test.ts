import { describe, expect, it } from "vitest";
import { entitlementGateIsOff } from "../src/premium/premium-access";

describe("entitlementGateIsOff", () => {
  it("is off when the local flag says off in a dev build", () => {
    expect(entitlementGateIsOff("off", true)).toBe(true);
  });

  it("ignores the flag in a release build", () => {
    expect(entitlementGateIsOff("off", false)).toBe(false);
  });

  it("stays on without the flag", () => {
    expect(entitlementGateIsOff(undefined, true)).toBe(false);
    expect(entitlementGateIsOff("on", true)).toBe(false);
  });
});
