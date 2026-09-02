import type { IdentityLinkedProvider } from "@kit/api-contract";
import {
  IdTokenVerificationFailedError,
  type IdTokenVerifierAdapter,
  type VerifiedIdToken,
} from "./id-token.adapter.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readEmailVerified(value: unknown): boolean | null {
  if (value === true || value === "true") {
    return true;
  }
  if (value === false || value === "false") {
    return false;
  }
  return null;
}

function isJwt(token: string): boolean {
  return token.split(".").length === 3;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split(".")[1];
  if (!payload) {
    throw new IdTokenVerificationFailedError();
  }
  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    const record = asRecord(parsed);
    if (!record) {
      throw new IdTokenVerificationFailedError();
    }
    return record;
  } catch {
    throw new IdTokenVerificationFailedError();
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new IdTokenVerificationFailedError();
  }
  return value;
}

export class LiveIdTokenAdapter implements IdTokenVerifierAdapter {
  async verify(provider: IdentityLinkedProvider, idToken: string): Promise<VerifiedIdToken> {
    if (provider === "google") {
      return this.verifyGoogle(idToken);
    }
    return this.verifyFacebook(idToken);
  }

  private async verifyGoogle(idToken: string): Promise<VerifiedIdToken> {
    const audience = requireEnv("GOOGLE_CLIENT_ID");
    const url = new URL("https://oauth2.googleapis.com/tokeninfo");
    url.searchParams.set("id_token", idToken);

    const body = await this.fetchJson(url);
    const email = readString(body.email);
    const providerUserId = readString(body.sub);
    const emailVerified = readEmailVerified(body.email_verified);
    if (!email || !providerUserId || emailVerified === null || readString(body.aud) !== audience) {
      throw new IdTokenVerificationFailedError();
    }

    return {
      provider: "google",
      email: email.toLowerCase(),
      emailVerified,
      providerUserId,
      displayName: readString(body.name),
    };
  }

  private async verifyFacebook(idToken: string): Promise<VerifiedIdToken> {
    requireEnv("FACEBOOK_APP_ID");
    requireEnv("FACEBOOK_APP_SECRET");
    if (!isJwt(idToken)) {
      throw new IdTokenVerificationFailedError();
    }

    const claims = decodeJwtPayload(idToken);
    const email = readString(claims.email);
    const providerUserId = readString(claims.sub);
    const emailVerified = readEmailVerified(claims.email_verified);
    if (!email || !providerUserId || emailVerified === null) {
      throw new IdTokenVerificationFailedError();
    }

    return {
      provider: "facebook",
      email: email.toLowerCase(),
      emailVerified,
      providerUserId,
      displayName: readString(claims.name),
    };
  }

  private async fetchJson(url: URL): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      throw new IdTokenVerificationFailedError();
    }

    if (!response.ok) {
      throw new IdTokenVerificationFailedError();
    }

    const body: unknown = await response.json();
    const record = asRecord(body);
    if (!record || asRecord(record.error)) {
      throw new IdTokenVerificationFailedError();
    }

    return record;
  }
}
