import { describe, expect, it, vi } from "vitest";
import {
  TransfermarktHttpError,
  TransfermarktWafChallengeError,
} from "../src/fetch/transfermarkt-errors.js";
import {
  classifyTransfermarktFailure,
  createAdaptiveTransfermarktDelay,
  createTransfermarktRequestDelay,
  createTransfermarktRetryFetch,
  createTransfermarktThrottleState,
  isTransfermarktBlock,
  parsePositiveIntEnv,
  TRANSFERMARKT_RETRY_MAX_DELAY_MS,
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

  it("does not retry a missing page", async () => {
    const inner = vi
      .fn()
      .mockRejectedValue(new TransfermarktHttpError(404, "https://example.test/1"));
    const fetchHtml = createTransfermarktRetryFetch(inner, { maxAttempts: 3 });

    await expect(fetchHtml("https://example.test/1")).rejects.toBeInstanceOf(
      TransfermarktHttpError,
    );
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it("retries Transfermarkt's transient upstream errors", async () => {
    const sleep = vi.fn(async () => undefined);
    const inner = vi
      .fn()
      .mockRejectedValueOnce(new TransfermarktHttpError(502, "https://example.test/1"))
      .mockRejectedValueOnce(new TransfermarktHttpError(504, "https://example.test/1"))
      .mockResolvedValueOnce("<html>ok</html>");

    const fetchHtml = createTransfermarktRetryFetch(inner, {
      maxAttempts: 4,
      baseDelayMs: 100,
      sleep,
      random: () => 0,
    });

    await expect(fetchHtml("https://example.test/1")).resolves.toBe("<html>ok</html>");
    expect(inner).toHaveBeenCalledTimes(3);
  });

  it("retries a connect timeout", async () => {
    const sleep = vi.fn(async () => undefined);
    const timeout = Object.assign(new Error("connect timeout"), {
      code: "UND_ERR_CONNECT_TIMEOUT",
    });
    const inner = vi.fn().mockRejectedValueOnce(timeout).mockResolvedValueOnce("<html>ok</html>");

    const fetchHtml = createTransfermarktRetryFetch(inner, {
      maxAttempts: 3,
      baseDelayMs: 100,
      sleep,
      random: () => 0,
    });

    await expect(fetchHtml("https://example.test/1")).resolves.toBe("<html>ok</html>");
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it("retries the WAF challenge", async () => {
    const sleep = vi.fn(async () => undefined);
    const inner = vi
      .fn()
      .mockRejectedValueOnce(new TransfermarktWafChallengeError(202, "https://example.test/1"))
      .mockResolvedValueOnce("<html>ok</html>");

    const fetchHtml = createTransfermarktRetryFetch(inner, {
      maxAttempts: 3,
      baseDelayMs: 100,
      sleep,
      random: () => 0,
    });

    await expect(fetchHtml("https://example.test/1")).resolves.toBe("<html>ok</html>");
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it("caps the backoff delay", async () => {
    const sleep = vi.fn(async (_ms: number) => undefined);
    const inner = vi
      .fn()
      .mockRejectedValue(new TransfermarktHttpError(502, "https://example.test/1"));

    const fetchHtml = createTransfermarktRetryFetch(inner, {
      maxAttempts: 12,
      baseDelayMs: 2_000,
      sleep,
      random: () => 1,
    });

    await expect(fetchHtml("https://example.test/1")).rejects.toBeInstanceOf(
      TransfermarktHttpError,
    );
    for (const call of sleep.mock.calls) {
      const delay = call[0];
      if (typeof delay !== "number") {
        throw new Error("retry sleep must be called with a delay in milliseconds");
      }
      expect(delay).toBeLessThanOrEqual(TRANSFERMARKT_RETRY_MAX_DELAY_MS);
    }
  });
});

describe("classifyTransfermarktFailure", () => {
  it("separates transient upstream errors from a missing page and a hard failure", () => {
    expect(classifyTransfermarktFailure(new TransfermarktHttpError(502, "u"))).toBe("retryable");
    expect(classifyTransfermarktFailure(new TransfermarktHttpError(429, "u"))).toBe("retryable");
    expect(classifyTransfermarktFailure(new TransfermarktWafChallengeError(202, "u"))).toBe(
      "retryable",
    );
    expect(classifyTransfermarktFailure(new TransfermarktHttpError(404, "u"))).toBe("missing");
    expect(classifyTransfermarktFailure(new TransfermarktHttpError(400, "u"))).toBe("fatal");
    expect(classifyTransfermarktFailure(new Error("parse blew up"))).toBe("fatal");
  });

  it("treats a wrapped socket error as retryable", () => {
    const wrapped = Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }),
    });
    expect(classifyTransfermarktFailure(wrapped)).toBe("retryable");
  });
});

describe("isTransfermarktBlock", () => {
  it("counts the WAF and rate limits, not upstream hiccups", () => {
    expect(isTransfermarktBlock(new TransfermarktHttpError(403, "u"))).toBe(true);
    expect(isTransfermarktBlock(new TransfermarktWafChallengeError(202, "u"))).toBe(true);
    expect(isTransfermarktBlock(new TransfermarktHttpError(502, "u"))).toBe(false);
    expect(isTransfermarktBlock(new TransfermarktHttpError(504, "u"))).toBe(false);
  });
});

describe("createAdaptiveTransfermarktDelay", () => {
  it("backs off after a retryable failure and decays after successes", async () => {
    const sleep = vi.fn(async () => undefined);
    const now = 0;
    const clock = { now: () => now };
    const state = createTransfermarktThrottleState(1_000, 4_000);
    const inner = vi
      .fn()
      .mockRejectedValueOnce(new TransfermarktHttpError(502, "https://example.test/1"))
      .mockResolvedValue("<html>ok</html>");

    const fetchHtml = createAdaptiveTransfermarktDelay(inner, { state, sleep, clock });

    await expect(fetchHtml("https://example.test/1")).rejects.toBeInstanceOf(
      TransfermarktHttpError,
    );
    expect(state.currentDelayMs).toBe(1_500);

    await fetchHtml("https://example.test/2");
    expect(sleep).toHaveBeenCalledWith(1_500);
    expect(state.currentDelayMs).toBe(1_350);
  });

  it("never decays below the configured base delay", async () => {
    const state = createTransfermarktThrottleState(500);
    const fetchHtml = createAdaptiveTransfermarktDelay(async () => "<html>ok</html>", {
      state,
      sleep: async () => undefined,
      clock: { now: () => 0 },
    });

    await fetchHtml("https://example.test/1");
    await fetchHtml("https://example.test/2");

    expect(state.currentDelayMs).toBe(500);
  });

  it("shares pacing between the HTML and asset paths", async () => {
    const sleep = vi.fn(async () => undefined);
    const now = 0;
    const clock = { now: () => now };
    const state = createTransfermarktThrottleState(800);
    const html = createAdaptiveTransfermarktDelay(async () => "<html>ok</html>", {
      state,
      sleep,
      clock,
    });
    const bytes = createAdaptiveTransfermarktDelay(async () => new Uint8Array([1]), {
      state,
      sleep,
      clock,
    });

    await html("https://example.test/page");
    await bytes("https://img.example.test/portrait.jpg");

    expect(sleep).toHaveBeenCalledTimes(1);
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
