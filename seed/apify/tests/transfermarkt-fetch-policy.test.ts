import { describe, expect, it, vi } from "vitest";
import { TransfermarktHttpError } from "../src/fetch/kader-fetch-adapter.js";
import {
  createTransfermarktRequestDelay,
  createTransfermarktRetryFetch,
  parsePositiveIntEnv,
} from "../src/fetch/transfermarkt-fetch-policy.js";

describe("createTransfermarktRequestDelay", () => {
  it("waits the configured delay between consecutive GETs", async () => {
    const sleep = vi.fn(async () => undefined);
    let now = 0;
    const clock = { now: () => now };
    const inner = vi.fn(async () => {
      now += 10;
      return "<html>ok</html>";
    });

    const fetchHtml = createTransfermarktRequestDelay(inner, {
      delayMs: 100,
      sleep,
      clock,
    });

    await fetchHtml("https://example.test/1");
    now += 20;
    await fetchHtml("https://example.test/2");

    expect(inner).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(80);
  });

  it("does not sleep before the first GET", async () => {
    const sleep = vi.fn(async () => undefined);
    const inner = vi.fn(async () => "<html>ok</html>");
    const fetchHtml = createTransfermarktRequestDelay(inner, {
      delayMs: 100,
      sleep,
      clock: { now: () => 0 },
    });

    await fetchHtml("https://example.test/1");

    expect(sleep).not.toHaveBeenCalled();
  });
});

describe("createTransfermarktRetryFetch", () => {
  it("retries HTTP 403 on the same URL with exponential backoff before failing", async () => {
    const sleep = vi.fn(async () => undefined);
    const inner = vi
      .fn()
      .mockRejectedValueOnce(new TransfermarktHttpError(403, "https://example.test/1"))
      .mockResolvedValueOnce("<html>ok</html>");

    const fetchHtml = createTransfermarktRetryFetch(inner, {
      maxAttempts: 3,
      baseDelayMs: 100,
      sleep,
      random: () => 0,
    });

    await expect(fetchHtml("https://example.test/1")).resolves.toBe("<html>ok</html>");
    expect(inner).toHaveBeenCalledTimes(2);
    expect(inner).toHaveBeenNthCalledWith(1, "https://example.test/1");
    expect(inner).toHaveBeenNthCalledWith(2, "https://example.test/1");
    expect(sleep).toHaveBeenCalledWith(50);
  });

  it("throws after exhausting retry attempts for HTTP 429", async () => {
    const sleep = vi.fn(async () => undefined);
    const inner = vi
      .fn()
      .mockRejectedValue(new TransfermarktHttpError(429, "https://example.test/1"));

    const fetchHtml = createTransfermarktRetryFetch(inner, {
      maxAttempts: 2,
      baseDelayMs: 100,
      sleep,
      random: () => 0,
    });

    await expect(fetchHtml("https://example.test/1")).rejects.toBeInstanceOf(
      TransfermarktHttpError,
    );
    expect(inner).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("does not retry non-rate-limit HTTP errors", async () => {
    const inner = vi
      .fn()
      .mockRejectedValue(new TransfermarktHttpError(500, "https://example.test/1"));
    const fetchHtml = createTransfermarktRetryFetch(inner, { maxAttempts: 3 });

    await expect(fetchHtml("https://example.test/1")).rejects.toBeInstanceOf(
      TransfermarktHttpError,
    );
    expect(inner).toHaveBeenCalledTimes(1);
  });
});

describe("parsePositiveIntEnv", () => {
  it("returns fallback for missing or invalid values", () => {
    expect(parsePositiveIntEnv(undefined, 42)).toBe(42);
    expect(parsePositiveIntEnv("not-a-number", 42)).toBe(42);
    expect(parsePositiveIntEnv("-1", 42)).toBe(42);
  });

  it("parses non-negative integers", () => {
    expect(parsePositiveIntEnv("0", 42)).toBe(0);
    expect(parsePositiveIntEnv("1500", 42)).toBe(1500);
  });
});
