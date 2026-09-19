import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTH_THROTTLE_BANNER_MESSAGE,
  IdentityAuthError,
  identityAuthErrorFromResponse,
  isIdentityAuthThrottleError,
} from "../src/auth/identity-auth-error";

const authDir = join(__dirname, "../app/(auth)");
const apiDir = join(__dirname, "../src/api");
const firstSessionDir = join(__dirname, "../app/(first-session)");
const doorSheetPath = join(__dirname, "../src/first-session/door-sheet.tsx");

describe("identityAuthErrorFromResponse", () => {
  it("maps 429 to the Auth throttle banner message", () => {
    const error = identityAuthErrorFromResponse(new Response(null, { status: 429 }), {
      fallbackMessage: "Fallback",
      invalidCredentialsMessage: "Forkert e-mail eller adgangskode",
    });
    expect(error.status).toBe(429);
    expect(error.message).toBe(AUTH_THROTTLE_BANNER_MESSAGE);
  });

  it("maps 401 to the invalid-credentials message", () => {
    const error = identityAuthErrorFromResponse(new Response(null, { status: 401 }), {
      fallbackMessage: "Fallback",
      invalidCredentialsMessage: "Forkert e-mail eller adgangskode",
    });
    expect(error.status).toBe(401);
    expect(error.message).toBe("Forkert e-mail eller adgangskode");
  });
});

describe("Auth throttle error seam", () => {
  it("detects 429 and preserves 401 invalid-credentials mapping", () => {
    expect(
      isIdentityAuthThrottleError(new IdentityAuthError(429, AUTH_THROTTLE_BANNER_MESSAGE)),
    ).toBe(true);
    expect(
      isIdentityAuthThrottleError(new IdentityAuthError(401, "Forkert e-mail eller adgangskode")),
    ).toBe(false);
  });
});

describe("Expo Auth throttle Banner chrome", () => {
  it("uses Banner on login, register, reset, and first-session door for 429", () => {
    const login = readFileSync(join(authDir, "login.tsx"), "utf8");
    const register = readFileSync(join(authDir, "register.tsx"), "utf8");
    const reset = readFileSync(join(authDir, "reset.tsx"), "utf8");
    const firstSession = readFileSync(join(firstSessionDir, "index.tsx"), "utf8");
    const doorSheet = readFileSync(doorSheetPath, "utf8");
    const doorFaces = readFileSync(join(__dirname, "../src/first-session/door-faces.tsx"), "utf8");
    const identityApi = readFileSync(join(apiDir, "identity.ts"), "utf8");

    for (const source of [login, register, reset]) {
      expect(source).toContain("AuthThrottleBanner");
      expect(source).toContain("resolveAuthErrorFeedback");
      expect(source).toContain("showThrottleBanner");
    }

    expect(doorFaces).toContain("AuthThrottleBanner");
    expect(doorSheet).toContain("showThrottleBanner");

    expect(firstSession).toContain("resolveAuthErrorFeedback");
    expect(firstSession).toContain("showThrottleBanner");

    expect(identityApi).toContain("identityAuthErrorFromResponse");
    expect(identityApi).toContain('requestJson("/v1/identity/login"');
    expect(identityApi).toContain('requestJson("/v1/identity/register"');
    expect(identityApi).toContain('requestJson("/v1/identity/password-reset"');
    const forbiddenDbImport = "@" + "kit/db";
    expect(identityApi).not.toContain(forbiddenDbImport);
    expect(identityApi).not.toContain("apps/api");
  });

  it("flags missing design-lock copy for the throttle Banner", () => {
    const copy = readFileSync(join(__dirname, "../src/auth/identity-auth-error.ts"), "utf8");
    expect(copy).toContain("Design-system gap (KIT-181)");
    expect(copy).toContain(AUTH_THROTTLE_BANNER_MESSAGE);
  });
});
