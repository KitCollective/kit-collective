import { describe, expect, it } from "vitest";
import {
  identityAccountUpdateSchema,
  identityEmailChangeSchema,
  identityLinkedAccountSchema,
  identityMeSchema,
  identityPasswordChangeSchema,
} from "../src/index.js";

describe("identityPasswordChangeSchema", () => {
  it("accepts current and new password", () => {
    expect(
      identityPasswordChangeSchema.parse({
        currentPassword: "password123",
        newPassword: "newpassword456",
      }),
    ).toEqual({
      currentPassword: "password123",
      newPassword: "newpassword456",
    });
  });

  it("rejects short new password", () => {
    expect(() =>
      identityPasswordChangeSchema.parse({
        currentPassword: "password123",
        newPassword: "short",
      }),
    ).toThrow();
  });
});

describe("identityEmailChangeSchema", () => {
  it("accepts email and password", () => {
    expect(
      identityEmailChangeSchema.parse({
        email: "new@example.com",
        password: "password123",
      }),
    ).toEqual({
      email: "new@example.com",
      password: "password123",
    });
  });

  it("rejects invalid email", () => {
    expect(() =>
      identityEmailChangeSchema.parse({
        email: "not-an-email",
        password: "password123",
      }),
    ).toThrow();
  });
});

describe("identityAccountUpdateSchema", () => {
  it("accepts private account fields", () => {
    expect(
      identityAccountUpdateSchema.parse({
        fullName: "Ada Lovelace",
        phone: "+4512345678",
        birthday: "1990-05-15",
      }),
    ).toEqual({
      fullName: "Ada Lovelace",
      phone: "+4512345678",
      birthday: "1990-05-15",
    });
  });

  it("rejects empty patch", () => {
    expect(() => identityAccountUpdateSchema.parse({})).toThrow();
  });
});

describe("identityLinkedAccountSchema", () => {
  it("accepts linked Google and unlinked Facebook", () => {
    expect(
      identityLinkedAccountSchema.parse({
        provider: "google",
        linked: true,
      }),
    ).toEqual({ provider: "google", linked: true });
  });
});

describe("identityMeSchema account fields", () => {
  it("accepts account metadata on me", () => {
    const me = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      email: "collector@example.com",
      role: "user" as const,
      handle: "collector",
      aboutMe: null,
      avatarUrl: null,
      emailVerified: true,
      fullName: "Ada Lovelace",
      phone: "+4512345678",
      birthday: "1990-05-15",
      linkedAccounts: [
        { provider: "google" as const, linked: false },
        { provider: "facebook" as const, linked: false },
      ],
      countryId: null,
      countryLabel: null,
      city: null,
      showCity: false,
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
