import { describe, expect, it } from "vitest";
import { baseHandleFromEmail } from "../src/identity/handle.js";

describe("baseHandleFromEmail", () => {
  it("derives handle from email local-part", () => {
    expect(baseHandleFromEmail("Collector@Example.com")).toBe("collector");
  });

  it("strips non-alphanumeric characters", () => {
    expect(baseHandleFromEmail("same+alias@example.com")).toBe("samealias");
  });

  it("falls back to user when local-part sanitizes empty", () => {
    expect(baseHandleFromEmail("+++@example.com")).toBe("user");
  });
});
