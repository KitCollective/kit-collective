import { describe, expect, it } from "vitest";
import {
  grantCompRequestSchema,
  grantCompResponseSchema,
  offerPatchRequestSchema,
  offerSchema,
} from "../src/index.js";

describe("offerSchema", () => {
  it("accepts IAP product ids and trial settings", () => {
    const offer = {
      monthProductId: "com.kitcollective.premium.month",
      yearProductId: "com.kitcollective.premium.year",
      trialEnabled: true,
      trialDays: 3,
    };
    expect(offerSchema.parse(offer)).toEqual(offer);
  });
});

describe("offerPatchRequestSchema", () => {
  it("matches offer shape", () => {
    const body = {
      monthProductId: "com.kitcollective.premium.month",
      yearProductId: "com.kitcollective.premium.year",
      trialEnabled: false,
      trialDays: 0,
    };
    expect(offerPatchRequestSchema.parse(body)).toEqual(body);
  });
});

describe("grantCompRequestSchema", () => {
  it("accepts an expiry timestamp", () => {
    const body = { expires: "2026-12-31T23:59:59.000Z" };
    expect(grantCompRequestSchema.parse(body)).toEqual(body);
  });
});

describe("grantCompResponseSchema", () => {
  it("accepts comp entitlement", () => {
    const response = {
      live: true,
      source: "comp" as const,
      expires: "2026-12-31T23:59:59.000Z",
      trialUsed: false,
    };
    expect(grantCompResponseSchema.parse(response)).toEqual(response);
  });
});
