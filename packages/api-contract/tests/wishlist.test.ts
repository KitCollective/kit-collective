import { describe, expect, it } from "vitest";
import { billingPaywallErrorSchema } from "../src/billing/paywall.js";
import {
  wishlistEntriesSchema,
  wishlistEntryIdParamSchema,
  wishlistEntrySchema,
  wishlistEntryWriteSchema,
} from "../src/wishlist/entries.js";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const UUID_B = "550e8400-e29b-41d4-a716-446655440001";

describe("wishlistEntryWriteSchema", () => {
  it("accepts any single criterion", () => {
    expect(wishlistEntryWriteSchema.parse({ clubId: UUID })).toEqual({ clubId: UUID });
    expect(wishlistEntryWriteSchema.parse({ seasonId: UUID })).toEqual({ seasonId: UUID });
    expect(wishlistEntryWriteSchema.parse({ type: "home" })).toEqual({ type: "home" });
  });

  it("accepts multiple criteria for AND wishlist rows", () => {
    const payload = { clubId: UUID, seasonId: UUID_B, type: "away", size: "m" };
    expect(wishlistEntryWriteSchema.parse(payload)).toEqual(payload);
  });

  it("rejects write without clubId, seasonId, or type", () => {
    expect(() => wishlistEntryWriteSchema.parse({ size: "m" })).toThrow();
    expect(() => wishlistEntryWriteSchema.parse({})).toThrow();
  });
});

describe("wishlistEntrySchema", () => {
  it("accepts entry with resolved labels and AND meta", () => {
    const payload = {
      id: UUID,
      name: "F.C. København · 2023/24 · Hjemme · M",
      meta: "F.C. København · 2023/24 · Hjemme · M",
      clubId: UUID,
      clubLabel: "F.C. København",
      seasonId: UUID_B,
      seasonLabel: "2023/24",
      type: "home" as const,
      typeLabel: "Hjemme",
      size: "m" as const,
      sizeLabel: "M",
    };
    expect(wishlistEntrySchema.parse(payload)).toEqual(payload);
  });
});

describe("wishlistEntriesSchema", () => {
  it("accepts an entries list", () => {
    const payload = {
      entries: [
        {
          id: UUID,
          name: "F.C. København",
          meta: "F.C. København",
          clubId: UUID,
          clubLabel: "F.C. København",
          seasonId: null,
          seasonLabel: null,
          type: null,
          typeLabel: null,
          size: null,
          sizeLabel: null,
        },
      ],
    };
    expect(wishlistEntriesSchema.parse(payload)).toEqual(payload);
  });
});

describe("wishlistEntryIdParamSchema", () => {
  it("accepts entryId param", () => {
    expect(wishlistEntryIdParamSchema.parse({ entryId: UUID })).toEqual({ entryId: UUID });
  });
});

describe("billingPaywallErrorSchema", () => {
  it("accepts PREMIUM_REQUIRED paywall code", () => {
    expect(
      billingPaywallErrorSchema.parse({
        code: "PREMIUM_REQUIRED",
        message: "Premium is required",
      }),
    ).toEqual({
      code: "PREMIUM_REQUIRED",
      message: "Premium is required",
    });
  });
});
