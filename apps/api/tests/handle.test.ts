import { describe, expect, it } from "vitest";
import { baseHandleFromEmail, nextHandleCandidate } from "../src/identity/identity.helpers.js";

describe("baseHandleFromEmail", () => {
  it("derives handle from email local-part", () => {
    expect(baseHandleFromEmail("Collector@Example.com")).toBe("collector");
  });

  it("replaces non-alphanumeric characters with underscores", () => {
    expect(baseHandleFromEmail("same+alias@example.com")).toBe("same_alias");
  });

  it("prefixes u_ when local-part is only symbols", () => {
    expect(baseHandleFromEmail("+++@example.com")).toBe("u_u");
  });
});

describe("nextHandleCandidate", () => {
  it("returns the base handle on the first attempt", () => {
    expect(nextHandleCandidate("collector", 0)).toBe("collector");
  });

  it("appends a numeric suffix on collision", () => {
    expect(nextHandleCandidate("same", 1)).toBe("same2");
  });
});
