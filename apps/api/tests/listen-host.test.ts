import { afterEach, describe, expect, it } from "vitest";
import { apiListenHost } from "../src/config/listen-host.js";

describe("apiListenHost", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("binds IPv4-only in production when HOST is unset", () => {
    delete process.env.HOST;
    process.env.NODE_ENV = "production";

    expect(apiListenHost()).toBe("0.0.0.0");
  });

  it("binds IPv6 dual-stack in non-production when HOST is unset", () => {
    delete process.env.HOST;
    process.env.NODE_ENV = "development";

    expect(apiListenHost()).toBe("::");
  });

  it("honors an explicit HOST override", () => {
    process.env.HOST = "127.0.0.1";
    process.env.NODE_ENV = "development";

    expect(apiListenHost()).toBe("127.0.0.1");
  });
});
