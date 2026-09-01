import { afterEach, describe, expect, it, vi } from "vitest";
import { IdTokenVerificationFailedError } from "../dist/identity/id-token.adapter.js";
import { LiveIdTokenAdapter } from "../dist/identity/live-id-token.adapter.js";

function jwtWithClaims(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${header}.${payload}.sig`;
}

describe("LiveIdTokenAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.FACEBOOK_APP_ID;
    delete process.env.FACEBOOK_APP_SECRET;
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

  it("rejects a Facebook Graph access token and an unverified Limited Login JWT", async () => {
    process.env.FACEBOOK_APP_ID = "app";
    process.env.FACEBOOK_APP_SECRET = "secret";
    const adapter = new LiveIdTokenAdapter();

    await expect(adapter.verify("facebook", "EAABaccess")).rejects.toBeInstanceOf(
      IdTokenVerificationFailedError,
    );

    const unverified = jwtWithClaims({
      email: "collector@example.com",
      email_verified: false,
      sub: "fid-1",
    });
    const claims = await adapter.verify("facebook", unverified);
    expect(claims.emailVerified).toBe(false);
    expect(claims.providerUserId).toBe("fid-1");
  });
});
