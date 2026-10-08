import type { IapVerifierAdapter } from "./iap-verifier.adapter.js";
import { NoopIapVerifierAdapter } from "./noop-iap.adapter.js";

/** Real Apple/Google verification lands when lane secrets are configured. */
export function createIapVerifierAdapter(): IapVerifierAdapter {
  return new NoopIapVerifierAdapter();
}
