import { afterEach, describe, expect, it } from "vitest";
import { requireJwtSecret } from "../src/config/jwt-secret.js";

describe("requireJwtSecret", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns trimmed JWT_SECRET when set", () => {
    process.env.JWT_SECRET = "  my-secret  ";
    expect(requireJwtSecret()).toBe("my-secret");
  });

  it("throws when JWT_SECRET is unset", () => {
    delete process.env.JWT_SECRET;
    expect(() => requireJwtSecret()).toThrow(/JWT_SECRET/);
  });

  it("throws when JWT_SECRET is empty", () => {
    process.env.JWT_SECRET = "   ";
    expect(() => requireJwtSecret()).toThrow(/JWT_SECRET/);
  });
});
