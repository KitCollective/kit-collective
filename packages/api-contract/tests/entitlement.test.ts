import { describe, expect, it } from "vitest";
import {
  billingIapResponseSchema,
  entitlementSchema,
  iapPlatformSchema,
  iapRestoreRequestSchema,
  iapVerifyRequestSchema,
} from "../src/billing/entitlement.js";

describe("entitlementSchema", () => {
  it("accepts inactive entitlement with null source", () => {
    expect(
      entitlementSchema.parse({
        live: false,
        source: null,
        expires: null,
        trialUsed: false,
      }),
    ).toEqual({
      live: false,
      source: null,
      expires: null,
      trialUsed: false,
    });
  });

  it("accepts visionMatcher usage on GET session entitlement", () => {
    expect(
      entitlementSchema.parse({
        live: false,
        source: null,
        expires: null,
        trialUsed: false,
        visionMatcher: { used: 3, cap: 10, remaining: 7, unlimited: false },
      }),
    ).toMatchObject({
      visionMatcher: { used: 3, cap: 10, remaining: 7, unlimited: false },
    });
  });

  it("marks live entitlement as unlimited Vision Matcher", () => {
    expect(
      entitlementSchema.parse({
        live: true,
        source: "comp",
        expires: "2026-09-02T12:00:00.000Z",
        trialUsed: false,
        visionMatcher: { used: 11, cap: 10, remaining: 10, unlimited: true },
      }).visionMatcher,
    ).toEqual({ used: 11, cap: 10, remaining: 10, unlimited: true });
  });

  it("accepts live trial entitlement", () => {
    expect(
      entitlementSchema.parse({
        live: true,
        source: "trial",
        expires: "2026-09-02T12:00:00.000Z",
        trialUsed: true,
      }),
    ).toMatchObject({
      live: true,
      source: "trial",
      trialUsed: true,
    });
  });
});

describe("iap billing schemas", () => {
  it("accepts verify request for apple month sku", () => {
    expect(
      iapVerifyRequestSchema.parse({
        platform: "apple",
        productId: "com.kitcollective.premium.month",
        token: "store-receipt-token",
      }),
    ).toMatchObject({
      platform: "apple",
      productId: "com.kitcollective.premium.month",
    });
  });

  it("accepts restore request", () => {
    expect(
      iapRestoreRequestSchema.parse({
        platform: "google",
        token: "restore-token",
      }),
    ).toEqual({
      platform: "google",
      token: "restore-token",
    });
  });

  it("rejects unknown platform", () => {
    expect(() => iapPlatformSchema.parse("stripe")).toThrow();
  });

  it("returns entitlement shape from billingIapResponseSchema", () => {
    expect(
      billingIapResponseSchema.parse({
        live: true,
        source: "iap_apple",
        expires: "2026-09-02T12:00:00.000Z",
        trialUsed: false,
      }),
    ).toMatchObject({
      live: true,
      source: "iap_apple",
    });
  });
});
