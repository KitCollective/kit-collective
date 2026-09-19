import { describe, expect, it } from "vitest";
import { laneDatabaseEnvVar, resolveSeedLane } from "../src/lane.js";

describe("resolveSeedLane", () => {
  it("defaults to development when lane is omitted", () => {
    expect(resolveSeedLane()).toEqual({ ok: true, lane: "development" });
    expect(resolveSeedLane(undefined)).toEqual({ ok: true, lane: "development" });
    expect(resolveSeedLane("")).toEqual({ ok: true, lane: "development" });
  });

  it("accepts staging only when explicitly named", () => {
    expect(resolveSeedLane("staging")).toEqual({ ok: true, lane: "staging" });
    expect(resolveSeedLane("STAGING")).toEqual({ ok: true, lane: "staging" });
  });

  it("rejects production", () => {
    const result = resolveSeedLane("production");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("production");
    }
  });

  it("rejects unknown lanes", () => {
    const result = resolveSeedLane("qa");
    expect(result.ok).toBe(false);
  });
});

describe("laneDatabaseEnvVar", () => {
  it("maps development to DATABASE_URL and staging to SEED_STAGING_DATABASE_URL", () => {
    expect(laneDatabaseEnvVar("development")).toBe("DATABASE_URL");
    expect(laneDatabaseEnvVar("staging")).toBe("SEED_STAGING_DATABASE_URL");
  });
});
