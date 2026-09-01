import { createHmac } from "node:crypto";
import type { IdentityLinkedProvider } from "@kit/api-contract";
import {
  IdTokenVerificationFailedError,
  type IdTokenVerifierAdapter,
  type VerifiedIdToken,
} from "./id-token.adapter.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function googleEmailVerified(value: unknown): boolean {
  return value === true || value === "true";
}

export class LiveIdTokenAdapter implements IdTokenVerifierAdapter {
  async verify(provider: IdentityLinkedProvider, idToken: string): Promise<VerifiedIdToken> {
    if (provider === "google") {
      return this.verifyGoogle(idToken);
    }
    return this.verifyFacebook(idToken);
  }

  private async verifyGoogle(idToken: string): Promise<VerifiedIdToken> {
    const url = new URL("https://oauth2.googleapis.com/tokeninfo");
    url.searchParams.set("id_token", idToken);

    const body = await this.fetchJson(url);
    const email = readString(body.email);
    const providerUserId = readString(body.sub);
    if (!email || !providerUserId) {
      throw new IdTokenVerificationFailedError();
    }

    const audience = process.env.GOOGLE_CLIENT_ID?.trim();
    if (audience && readString(body.aud) !== audience) {
      throw new IdTokenVerificationFailedError();
    }

    return {
      provider: "google",
      email: email.toLowerCase(),
      emailVerified: googleEmailVerified(body.email_verified),
      providerUserId,
      displayName: readString(body.name),
    };
  }

  private async verifyFacebook(idToken: string): Promise<VerifiedIdToken> {
    const url = new URL("https://graph.facebook.com/me");
    url.searchParams.set("fields", "id,email,name");
    url.searchParams.set("access_token", idToken);

    const appSecret = process.env.FACEBOOK_APP_SECRET?.trim();
    if (appSecret) {
      url.searchParams.set(
        "appsecret_proof",
        createHmac("sha256", appSecret).update(idToken).digest("hex"),
      );
    }

    const body = await this.fetchJson(url);
    const email = readString(body.email);
    const providerUserId = readString(body.id);
    if (!email || !providerUserId) {
      throw new IdTokenVerificationFailedError();
    }

    return {
      provider: "facebook",
      email: email.toLowerCase(),
      emailVerified: true,
      providerUserId,
      displayName: readString(body.name),
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
    if (!isRecord(body) || isRecord(body.error)) {
      throw new IdTokenVerificationFailedError();
    }

    return body;
  }
}
