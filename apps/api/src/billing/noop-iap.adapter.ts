import type { IapVerificationResult, IapVerifierAdapter } from "./iap-verifier.adapter.js";

/** No-op when Apple/Google IAP secrets are unset. */
export class NoopIapVerifierAdapter implements IapVerifierAdapter {
  async verify(): Promise<IapVerificationResult> {
    throw new Error("IAP verifier is not configured");
  }

  async restore(): Promise<IapVerificationResult | null> {
    throw new Error("IAP verifier is not configured");
  }
}
