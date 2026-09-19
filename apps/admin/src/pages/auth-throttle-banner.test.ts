import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AUTH_THROTTLE_BANNER_MESSAGE,
  IdentityAuthError,
  isIdentityAuthThrottleError,
  throwIdentityAuthError,
} from "../auth/identity-auth-error.js";

const here = dirname(fileURLToPath(import.meta.url));
const authDir = join(here, "../auth");
const pagesDir = join(here, "..");

describe("throwIdentityAuthError", () => {
  it("maps 429 to the Auth throttle banner message", async () => {
    await expect(
      throwIdentityAuthError(new Response(null, { status: 429 }), {
        fallbackMessage: "Fallback",
        invalidCredentialsMessage: "Invalid email or password",
      }),
    ).rejects.toMatchObject({
      status: 429,
      message: AUTH_THROTTLE_BANNER_MESSAGE,
    });
  });

  it("maps 401 to the invalid-credentials message", async () => {
    await expect(
      throwIdentityAuthError(new Response(null, { status: 401 }), {
        fallbackMessage: "Fallback",
        invalidCredentialsMessage: "Invalid email or password",
      }),
    ).rejects.toMatchObject({
      status: 401,
      message: "Invalid email or password",
    });
  });
});

describe("Auth throttle error seam", () => {
  it("detects 429 and preserves 401 invalid-credentials mapping", () => {
    expect(
      isIdentityAuthThrottleError(new IdentityAuthError(429, AUTH_THROTTLE_BANNER_MESSAGE)),
    ).toBe(true);
    expect(
      isIdentityAuthThrottleError(new IdentityAuthError(401, "Invalid email or password")),
    ).toBe(false);
  });
});

describe("Admin Sign in throttle Banner chrome", () => {
  it("uses a warning Banner on Sign in for 429 and keeps 401 as banner-error", () => {
    const login = readFileSync(join(pagesDir, "pages/LoginPage.tsx"), "utf8");
    const authProvider = readFileSync(join(authDir, "AuthProvider.tsx"), "utf8");
    const identityAuthFetch = readFileSync(join(authDir, "identity-auth-fetch.ts"), "utf8");

    expect(login).toContain("banner-warning");
    expect(login).toContain("showThrottleBanner");
    expect(login).toContain("resolveAuthErrorFeedback");
    expect(login).toContain("AUTH_THROTTLE_BANNER_MESSAGE");
    expect(login).toContain('role="alert"');
    expect(login).toContain("banner-error");
    expect(login).not.toMatch(/captcha/i);
    expect(login).not.toMatch(/countdown/i);

    expect(authProvider).toContain("identityAuthFetch");
    expect(authProvider).toContain('"/identity/login"');
    expect(authProvider).toContain('"/identity/social"');

    expect(identityAuthFetch).toContain("throwIdentityAuthError");
    expect(identityAuthFetch).toContain("joinApiPath(getApiBase(), path)");
  });
});
