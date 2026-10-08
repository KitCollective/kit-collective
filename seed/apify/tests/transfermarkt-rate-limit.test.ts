import { describe, expect, it, vi } from "vitest";
import {
  TransfermarktHttpError,
  TransfermarktWafChallengeError,
} from "../src/fetch/transfermarkt-errors.js";
import {
  createTransfermarktCircuitState,
  createTransfermarktRateLimitGuard,
  TransfermarktCircuitOpenError,
} from "../src/fetch/transfermarkt-rate-limit.js";

describe("createTransfermarktRateLimitGuard", () => {
  it("opens the circuit after N consecutive HTTP 403 responses", async () => {
    const inner = vi
      .fn()
      .mockRejectedValue(new TransfermarktHttpError(403, "https://example.test/1"));
    const guard = createTransfermarktRateLimitGuard(inner, { stopAfter: 2 });

    await expect(guard.fetchHtml("https://example.test/1")).rejects.toBeInstanceOf(
      TransfermarktHttpError,
    );
    expect(guard.isOpen()).toBe(false);

    await expect(guard.fetchHtml("https://example.test/2")).rejects.toBeInstanceOf(
      TransfermarktHttpError,
    );
    expect(guard.isOpen()).toBe(true);

    await expect(guard.fetchHtml("https://example.test/3")).rejects.toBeInstanceOf(
      TransfermarktCircuitOpenError,
    );
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it("resets consecutive counter after a successful fetch", async () => {
    const inner = vi
      .fn()
      .mockRejectedValueOnce(new TransfermarktHttpError(429, "https://example.test/1"))
      .mockResolvedValueOnce("<html>ok</html>")
      .mockRejectedValueOnce(new TransfermarktHttpError(403, "https://example.test/3"));
    const guard = createTransfermarktRateLimitGuard(inner, { stopAfter: 2 });

    await expect(guard.fetchHtml("https://example.test/1")).rejects.toBeInstanceOf(
      TransfermarktHttpError,
    );
    await expect(guard.fetchHtml("https://example.test/2")).resolves.toBe("<html>ok</html>");
    await expect(guard.fetchHtml("https://example.test/3")).rejects.toBeInstanceOf(
      TransfermarktHttpError,
    );

    expect(guard.isOpen()).toBe(false);
    expect(inner).toHaveBeenCalledTimes(3);
  });

  it("does not open the circuit on Transfermarkt's transient upstream errors", async () => {
    const inner = vi
      .fn()
      .mockRejectedValue(new TransfermarktHttpError(502, "https://example.test/1"));
    const guard = createTransfermarktRateLimitGuard(inner, { stopAfter: 2 });

    for (const url of ["1", "2", "3"]) {
      await expect(guard.fetchHtml(`https://example.test/${url}`)).rejects.toBeInstanceOf(
        TransfermarktHttpError,
      );
    }

    expect(guard.isOpen()).toBe(false);
    expect(guard.consecutiveRateLimitErrors()).toBe(0);
    expect(inner).toHaveBeenCalledTimes(3);
  });

  it("opens on the WAF challenge", async () => {
    const inner = vi
      .fn()
      .mockRejectedValue(new TransfermarktWafChallengeError(202, "https://example.test/1"));
    const guard = createTransfermarktRateLimitGuard(inner, { stopAfter: 1 });

    await expect(guard.fetchHtml("https://example.test/1")).rejects.toBeInstanceOf(
      TransfermarktWafChallengeError,
    );
    expect(guard.isOpen()).toBe(true);
  });

  it("shares one circuit between the HTML and asset guards", async () => {
    const state = createTransfermarktCircuitState();
    const htmlGuard = createTransfermarktRateLimitGuard(
      async () => {
        throw new TransfermarktHttpError(403, "https://example.test/page");
      },
      { stopAfter: 1, state },
    );
    const assetGuard = createTransfermarktRateLimitGuard(async () => new Uint8Array([1]), {
      stopAfter: 1,
      state,
    });

    await expect(htmlGuard.fetchHtml("https://example.test/page")).rejects.toBeInstanceOf(
      TransfermarktHttpError,
    );

    await expect(assetGuard.fetchHtml("https://img.example.test/a.jpg")).rejects.toBeInstanceOf(
      TransfermarktCircuitOpenError,
    );
  });
});
