import type { IapPlatform } from "@kit/api-contract";
import type { IapVerificationResult, IapVerifierAdapter } from "./iap-verifier.adapter.js";

export class IapVerificationFailedError extends Error {
  constructor(message = "Invalid purchase token") {
    super(message);
    this.name = "IapVerificationFailedError";
  }
}

/** Deterministic fake verifier for contract tests. */
export class FakeIapVerifierAdapter implements IapVerifierAdapter {
  async verify(
    token: string,
    _platform: IapPlatform,
    _productId: string,
  ): Promise<IapVerificationResult> {
    if (token === "invalid-token") {
      throw new IapVerificationFailedError();
    }

    return {
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };
  }

  async restore(token: string, _platform: IapPlatform): Promise<IapVerificationResult | null> {
    if (token === "invalid-token") {
      throw new IapVerificationFailedError();
    }

    if (token === "empty-restore") {
      return null;
    }

    return {
      expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    };
  }
}
