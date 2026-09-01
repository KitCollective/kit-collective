import type { IdentityLinkedProvider } from "@kit/api-contract";
import {
  IdTokenVerificationFailedError,
  type IdTokenVerifierAdapter,
  type VerifiedIdToken,
} from "./id-token.adapter.js";

/**
 * Fixture idToken format (HTTP tests, default adapter):
 * `test:<provider>:<verified|unverified>:<email>:<providerUserId>[:<displayName>]`
 */
export class FakeIdTokenAdapter implements IdTokenVerifierAdapter {
  async verify(provider: IdentityLinkedProvider, idToken: string): Promise<VerifiedIdToken> {
    const parts = idToken.split(":");
    const prefix = parts[0];
    const tokenProvider = parts[1];
    const verification = parts[2];
    const email = parts[3];
    const providerUserId = parts[4];

    if (
      prefix !== "test" ||
      (tokenProvider !== "google" && tokenProvider !== "facebook") ||
      tokenProvider !== provider ||
      (verification !== "verified" && verification !== "unverified") ||
      !email ||
      !email.includes("@") ||
      !providerUserId
    ) {
      throw new IdTokenVerificationFailedError();
    }

    const displayName = parts.length > 5 ? parts.slice(5).join(":") : "";

    return {
      provider: tokenProvider,
      email: email.toLowerCase(),
      emailVerified: verification === "verified",
      providerUserId,
      displayName: displayName.length > 0 ? displayName : null,
    };
  }
}
