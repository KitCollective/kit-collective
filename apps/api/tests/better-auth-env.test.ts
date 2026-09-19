import { afterEach, describe, expect, it } from "vitest";
import { requireBetterAuthSecret, requireBetterAuthUrl } from "../src/config/better-auth-env.js";

describe("Better Auth boot env", () => {
  const previousSecret = process.env.BETTER_AUTH_SECRET;
  const previousUrl = process.env.BETTER_AUTH_URL;

  afterEach(() => {
    if (previousSecret === undefined) {
      delete process.env.BETTER_AUTH_SECRET;
    } else {
      process.env.BETTER_AUTH_SECRET = previousSecret;
    }
    if (previousUrl === undefined) {
      delete process.env.BETTER_AUTH_URL;
    } else {
      process.env.BETTER_AUTH_URL = previousUrl;
    }
  });

  it("returns a trimmed secret", () => {
    process.env.BETTER_AUTH_SECRET = "  my-secret  ";
    expect(requireBetterAuthSecret()).toBe("my-secret");
  });

  it("fails when BETTER_AUTH_SECRET is unset", () => {
    delete process.env.BETTER_AUTH_SECRET;
    expect(() => requireBetterAuthSecret()).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("fails when BETTER_AUTH_SECRET is blank", () => {
    process.env.BETTER_AUTH_SECRET = "   ";
    expect(() => requireBetterAuthSecret()).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("fails when BETTER_AUTH_URL is unset", () => {
    delete process.env.BETTER_AUTH_URL;
    expect(() => requireBetterAuthUrl()).toThrow(/BETTER_AUTH_URL/);
  });
});
