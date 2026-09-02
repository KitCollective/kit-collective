import { createPublicKey, verify } from "node:crypto";
import type { IdentityLinkedProvider } from "@kit/api-contract";
import {
  IdTokenVerificationFailedError,
  type IdTokenVerifierAdapter,
  type VerifiedIdToken,
} from "./id-token.adapter.js";

const FACEBOOK_GRAPH_VERSION = "v21.0";
const FACEBOOK_ISSUERS = new Set([
  "https://www.facebook.com",
  "https://www.facebook.com/",
  "https://limited.facebook.com",
  "https://limited.facebook.com/",
]);
const FACEBOOK_JWKS_URLS = [
  "https://limited.facebook.com/.well-known/oauth/openid/jwks/",
  "https://www.facebook.com/.well-known/oauth/openid/jwks/",
];

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

function decodeJwtJson(part: string): Record<string, unknown> {
  try {
    const json = Buffer.from(part, "base64url").toString("utf8");
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

function facebookEmailVerified(claims: Record<string, unknown>): boolean {
  const claimed = readEmailVerified(claims.email_verified);
  if (claimed === false) {
    return false;
  }
  return true;
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
    const jwt = isJwt(idToken) ? idToken : await this.exchangeFacebookAuthorizationCode(idToken);
    return this.verifyFacebookJwt(jwt);
  }

  private async exchangeFacebookAuthorizationCode(code: string): Promise<string> {
    const appId = requireEnv("FACEBOOK_APP_ID");
    const appSecret = requireEnv("FACEBOOK_APP_SECRET");
    const redirectUri = requireEnv("FACEBOOK_REDIRECT_URI");
    const url = new URL(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/oauth/access_token`);
    url.searchParams.set("client_id", appId);
    url.searchParams.set("client_secret", appSecret);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("code", code);

    const body = await this.fetchJson(url);
    const idToken = readString(body.id_token);
    if (!idToken || !isJwt(idToken)) {
      throw new IdTokenVerificationFailedError();
    }
    return idToken;
  }

  private async verifyFacebookJwt(idToken: string): Promise<VerifiedIdToken> {
    const audience = requireEnv("FACEBOOK_APP_ID");
    const [headerPart, payloadPart, signaturePart] = idToken.split(".");
    if (!headerPart || !payloadPart || !signaturePart) {
      throw new IdTokenVerificationFailedError();
    }

    const header = decodeJwtJson(headerPart);
    const kid = readString(header.kid);
    if (readString(header.alg) !== "RS256" || !kid) {
      throw new IdTokenVerificationFailedError();
    }

    const jwk = await this.facebookJwk(kid);
    const publicKey = createPublicKey({
      key: { kty: "RSA", n: jwk.n, e: jwk.e },
      format: "jwk",
    });
    const signed = Buffer.from(`${headerPart}.${payloadPart}`);
    const signature = Buffer.from(signaturePart, "base64url");
    if (!verify("RSA-SHA256", signed, publicKey, signature)) {
      throw new IdTokenVerificationFailedError();
    }

    const claims = decodeJwtJson(payloadPart);
    const email = readString(claims.email);
    const providerUserId = readString(claims.sub);
    const exp = typeof claims.exp === "number" ? claims.exp : Number.NaN;
    const iss = readString(claims.iss);
    if (
      !email ||
      !providerUserId ||
      !iss ||
      !FACEBOOK_ISSUERS.has(iss) ||
      readString(claims.aud) !== audience ||
      !Number.isFinite(exp) ||
      exp * 1000 <= Date.now()
    ) {
      throw new IdTokenVerificationFailedError();
    }

    return {
      provider: "facebook",
      email: email.toLowerCase(),
      emailVerified: facebookEmailVerified(claims),
      providerUserId,
      displayName: readString(claims.name),
    };
  }

  private async facebookJwk(kid: string): Promise<{ n: string; e: string }> {
    for (const endpoint of FACEBOOK_JWKS_URLS) {
      const body = await this.fetchJson(new URL(endpoint));
      const keys = Array.isArray(body.keys) ? body.keys : [];
      for (const key of keys) {
        const record = asRecord(key);
        const n = record ? readString(record.n) : null;
        const e = record ? readString(record.e) : null;
        if (
          record &&
          readString(record.kid) === kid &&
          readString(record.kty) === "RSA" &&
          n &&
          e
        ) {
          return { n, e };
        }
      }
    }
    throw new IdTokenVerificationFailedError();
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
