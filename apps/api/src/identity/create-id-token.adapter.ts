import { FakeIdTokenAdapter } from "./fake-id-token.adapter.js";
import type { IdTokenVerifierAdapter } from "./id-token.adapter.js";
import { LiveIdTokenAdapter } from "./live-id-token.adapter.js";

export function createIdTokenAdapter(): IdTokenVerifierAdapter {
  if (process.env.ID_TOKEN_ADAPTER === "live") {
    return new LiveIdTokenAdapter();
  }
  return new FakeIdTokenAdapter();
}
