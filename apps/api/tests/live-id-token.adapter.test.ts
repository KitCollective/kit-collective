import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IdTokenVerificationFailedError } from "../dist/identity/id-token.adapter.js";
import { LiveIdTokenAdapter } from "../dist/identity/live-id-token.adapter.js";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = publicKey.export({ format: "jwk" });
const TEST_KID = "facebook-test-kid";

function signedFacebookJwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: TEST_KID })).toString(
    "base64url",
  );
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const data = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(data), privateKey).toString("base64url");
  return `${data}.${signature}`;
}

function unsignedJwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${header}.${payload}.sig`;
}

function facebookClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    email: "collector@example.com",
    sub: "fid-1",
    name: "Ignored Name",
    aud: "facebook-app",
    iss: "https://www.facebook.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

function stubFacebookJwks(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes("oauth/access_token")) {
        return {
          ok: true,
          json: async () => ({
            access_token: "EAABaccess",
            id_token: signedFacebookJwt(facebookClaims()),
          }),
        };
      }
      if (url.includes("openid/jwks")) {
        return {
          ok: true,
          json: async () => ({
            keys: [{ ...publicJwk, kid: TEST_KID, kty: "RSA" }],
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    }),
  );
}

describe("LiveIdTokenAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.FACEBOOK_APP_ID;
    delete process.env.FACEBOOK_APP_SECRET;
    delete process.env.FACEBOOK_REDIRECT_URI;
  });

  it("requires GOOGLE_CLIENT_ID and reads email_verified from tokeninfo", async () => {
    process.env.GOOGLE_CLIENT_ID = "google-aud";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          email: "collector@example.com",
          email_verified: "true",
          sub: "gid-1",
          aud: "google-aud",
          name: "Ignored Name",
        }),
      })),
    );

    const claims = await new LiveIdTokenAdapter().verify("google", "google-id-token");
    expect(claims).toEqual({
      provider: "google",
      email: "collector@example.com",
      emailVerified: true,
      providerUserId: "gid-1",
      displayName: "Ignored Name",
    });
  });

  it("verifies a signed Facebook Limited Login JWT and treats a missing email_verified as granted", async () => {
    process.env.FACEBOOK_APP_ID = "facebook-app";
    stubFacebookJwks();
    const adapter = new LiveIdTokenAdapter();

    await expect(adapter.verify("facebook", "EAABaccess")).rejects.toBeInstanceOf(
      IdTokenVerificationFailedError,
    );
    await expect(adapter.verify("facebook", unsignedJwt(facebookClaims()))).rejects.toBeInstanceOf(
      IdTokenVerificationFailedError,
    );

    const claims = await adapter.verify("facebook", signedFacebookJwt(facebookClaims()));
    expect(claims).toEqual({
      provider: "facebook",
      email: "collector@example.com",
      emailVerified: true,
      providerUserId: "fid-1",
      displayName: "Ignored Name",
    });

    const unverified = await adapter.verify(
      "facebook",
      signedFacebookJwt(facebookClaims({ email_verified: false })),
    );
    expect(unverified.emailVerified).toBe(false);
  });

  it("exchanges a Facebook OIDC authorization code and verifies the returned id_token", async () => {
    process.env.FACEBOOK_APP_ID = "facebook-app";
    process.env.FACEBOOK_APP_SECRET = "facebook-secret";
    process.env.FACEBOOK_REDIRECT_URI = "https://admin.test/login";
    stubFacebookJwks();

    const claims = await new LiveIdTokenAdapter().verify("facebook", "oidc-code");
    expect(claims.providerUserId).toBe("fid-1");
    expect(claims.emailVerified).toBe(true);
  });
});
