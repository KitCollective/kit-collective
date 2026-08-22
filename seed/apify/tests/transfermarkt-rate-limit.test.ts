import { describe, expect, it, vi } from "vitest";
import { TransfermarktHttpError } from "../src/fetch/kader-fetch-adapter.js";
import {
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
});
