import { describe, expect, it } from "vitest";
import { entitlementSchema } from "../src/billing/entitlement.js";

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
