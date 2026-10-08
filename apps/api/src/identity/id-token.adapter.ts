import type { IdentityLinkedProvider } from "@kit/api-contract";

export class IdTokenVerificationFailedError extends Error {
  constructor(message = "Invalid id token") {
    super(message);
    this.name = "IdTokenVerificationFailedError";
  }
}

export type VerifiedIdToken = {
  provider: IdentityLinkedProvider;
  email: string;
  emailVerified: boolean;
  providerUserId: string;
  displayName: string | null;
};

export type IdTokenVerifierAdapter = {
  verify(provider: IdentityLinkedProvider, idToken: string): Promise<VerifiedIdToken>;
};
