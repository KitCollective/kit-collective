import type { IapVerifierAdapter } from "./iap-verifier.adapter.js";
import { NoopIapVerifierAdapter } from "./noop-iap.adapter.js";

function hasIapVerifierConfig(): boolean {
  return Boolean(
    process.env.APPLE_IAP_SHARED_SECRET?.trim() || process.env.GOOGLE_IAP_SERVICE_ACCOUNT?.trim(),
  );
}

export function createIapVerifierAdapter(): IapVerifierAdapter {
  if (!hasIapVerifierConfig()) {
    return new NoopIapVerifierAdapter();
  }

  // Real Apple/Google verification lands when lane secrets are configured.
  return new NoopIapVerifierAdapter();
}
