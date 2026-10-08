import { describe, expect, it } from "vitest";
import {
  acceptAllCookieConsent,
  cookieConsentSchema,
  essentialOnlyCookieConsent,
  identityExportSchema,
  identityPrefsSchema,
  identityPrefsUpdateSchema,
} from "../src/index.js";

describe("identityPrefsSchema", () => {
  const sample = {
    pushEnabled: false,
    pushHighPriority: true,
    pushOther: true,
    emailNews: false,
    emailHighPriority: true,
    privacyPersonalised: true,
    privacyRecentlySeen: true,
    privacyFavoriteNotifications: true,
    locale: "da" as const,
    appearance: "system" as const,
  };

  it("round-trips prefs", () => {
    expect(identityPrefsSchema.parse(sample)).toEqual(sample);
  });

  it("accepts partial updates", () => {
    expect(identityPrefsUpdateSchema.parse({ locale: "en" })).toEqual({ locale: "en" });
  });
});

describe("cookieConsentSchema", () => {
  it("essential-only sets analysis false", () => {
    const consent = essentialOnlyCookieConsent();
    expect(cookieConsentSchema.parse(consent)).toEqual({ analysis: false, marketing: false });
  });

  it("accept-all sets both categories on", () => {
    const consent = acceptAllCookieConsent();
    expect(cookieConsentSchema.parse(consent)).toEqual({ analysis: true, marketing: true });
  });
});

describe("identityExportSchema", () => {
  it("accepts profile fields and jersey ids", () => {
    const payload = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      email: "collector@example.com",
      handle: "collector",
      aboutMe: null,
      fullName: null,
      phone: null,
      birthday: null,
      userJerseyIds: ["660e8400-e29b-41d4-a716-446655440001"],
    };
    expect(identityExportSchema.parse(payload)).toEqual(payload);
  });
});
