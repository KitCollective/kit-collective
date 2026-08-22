import { afterEach, describe, expect, it } from "vitest";
import { corsAllowedOrigins, isCorsOriginAllowed } from "../src/config/cors-origins.js";

describe("corsAllowedOrigins", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns explicit allow-list from CORS_ALLOWED_ORIGINS", () => {
    process.env.CORS_ALLOWED_ORIGINS = "https://app.example.com, https://web.example.com";
    delete process.env.NODE_ENV;

    expect(corsAllowedOrigins()).toEqual(["https://app.example.com", "https://web.example.com"]);
  });

  it("denies all origins in production when unset", () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    process.env.NODE_ENV = "production";

    expect(corsAllowedOrigins()).toBe(false);
  });

  it("allows local Expo Web origins in non-production when unset", () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    process.env.NODE_ENV = "development";

    const allowed = corsAllowedOrigins();
    expect(allowed).not.toBe(false);
    expect(allowed).toContain("http://localhost:8081");
  });
});

describe("isCorsOriginAllowed", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("allows missing origin (same-origin / native clients)", () => {
    process.env.CORS_ALLOWED_ORIGINS = "https://app.example.com";
    expect(isCorsOriginAllowed(undefined)).toBe(true);
  });

  it("rejects origins not on the allow-list", () => {
    process.env.CORS_ALLOWED_ORIGINS = "https://app.example.com";
    expect(isCorsOriginAllowed("https://evil.example.com")).toBe(false);
  });

  it("accepts origins on the allow-list", () => {
    process.env.CORS_ALLOWED_ORIGINS = "https://app.example.com";
    expect(isCorsOriginAllowed("https://app.example.com")).toBe(true);
  });
});
