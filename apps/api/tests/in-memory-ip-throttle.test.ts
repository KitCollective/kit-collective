import { describe, expect, it } from "vitest";
import { InMemoryIpThrottle } from "../dist/vision/in-memory-ip-throttle.js";

describe("InMemoryIpThrottle", () => {
  it("allows up to the configured limit per IP", () => {
    const throttle = new InMemoryIpThrottle(2, 60_000);

    expect(throttle.tryConsume("203.0.113.1")).toBe(true);
    expect(throttle.tryConsume("203.0.113.1")).toBe(true);
    expect(throttle.tryConsume("203.0.113.1")).toBe(false);
    expect(throttle.tryConsume("203.0.113.2")).toBe(true);
  });
});
