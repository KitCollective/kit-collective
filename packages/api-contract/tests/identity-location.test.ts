import { describe, expect, it } from "vitest";
import { identityMeSchema, identityProfileUpdateSchema } from "../src/index.js";

describe("identityProfileUpdateSchema location", () => {
  it("accepts country, city, and showCity patch", () => {
    expect(
      identityProfileUpdateSchema.parse({
        countryId: "550e8400-e29b-41d4-a716-446655440000",
        city: "København",
        showCity: true,
      }),
    ).toEqual({
      countryId: "550e8400-e29b-41d4-a716-446655440000",
      city: "København",
      showCity: true,
    });
  });

  it("accepts clearing city with null", () => {
    expect(
      identityProfileUpdateSchema.parse({
        city: null,
      }),
    ).toEqual({ city: null });
  });

  it("rejects empty patch", () => {
    expect(() => identityProfileUpdateSchema.parse({})).toThrow();
  });
});

describe("identityMeSchema location fields", () => {
  it("accepts location metadata on me", () => {
    const me = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      email: "collector@example.com",
      role: "user" as const,
      handle: "collector",
      aboutMe: null,
      avatarUrl: null,
      emailVerified: true,
      fullName: null,
      phone: null,
      birthday: null,
      linkedAccounts: [
        { provider: "google" as const, linked: false },
        { provider: "facebook" as const, linked: false },
      ],
      countryId: "660e8400-e29b-41d4-a716-446655440000",
      countryLabel: "Danmark",
      city: "København",
      showCity: true,
      entitlement: {
        live: false,
        source: null,
        expires: null,
        trialUsed: false,
      },
    };

    expect(identityMeSchema.parse(me)).toEqual(me);
  });
});
