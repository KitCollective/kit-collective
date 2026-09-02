import { describe, expect, it } from "vitest";
import {
  createSocialIdTokenRequester,
  maybeCompleteFacebookOidcRedirect,
} from "./social-id-token.js";

describe("createSocialIdTokenRequester", () => {
  it("returns a Google GIS credential without loading an npm SDK", async () => {
    const request = createSocialIdTokenRequester({
      googleClientId: "google-web-client",
      loadScript: async () => undefined,
      google: {
        accounts: {
          id: {
            initialize(config) {
              config.callback({ credential: "google-id-token" });
            },
            prompt() {
              return;
            },
          },
        },
      },
    });

    await expect(request("google")).resolves.toBe("google-id-token");
  });

  it("returns a Facebook OIDC authorization code, not a Graph access token", async () => {
    const request = createSocialIdTokenRequester({
      facebookAppId: "facebook-app",
      facebookRedirectUri: "https://admin.test/login",
      async requestFacebookAuthorizationCode({ appId, redirectUri }) {
        expect(appId).toBe("facebook-app");
        expect(redirectUri).toBe("https://admin.test/login");
        return "facebook-oidc-code";
      },
    });

    await expect(request("facebook")).resolves.toBe("facebook-oidc-code");
  });

  it("rejects when Google GIS does not display a credential", async () => {
    const request = createSocialIdTokenRequester({
      googleClientId: "google-web-client",
      loadScript: async () => undefined,
      google: {
        accounts: {
          id: {
            initialize() {
              return;
            },
            prompt(listener) {
              listener?.({
                isNotDisplayed: () => true,
                isSkippedMoment: () => false,
                isDismissedMoment: () => false,
              });
            },
          },
        },
      },
    });

    await expect(request("google")).rejects.toThrow("Google sign-in is unavailable");
  });

  it("fails closed when client ids are missing", async () => {
    const request = createSocialIdTokenRequester({
      loadScript: async () => undefined,
    });

    await expect(request("google")).rejects.toThrow("Google sign-in is not configured");
    await expect(request("facebook")).rejects.toThrow("Facebook sign-in is not configured");
  });

  it("completes the Facebook OIDC popup by posting the authorization code", () => {
    const messages: unknown[] = [];
    let closed = false;
    const completed = maybeCompleteFacebookOidcRedirect({
      opener: {
        postMessage(data, origin) {
          messages.push({ data, origin });
        },
      },
      location: { search: "?code=facebook-oidc-code", origin: "https://admin.test" },
      close() {
        closed = true;
      },
    });

    expect(completed).toBe(true);
    expect(closed).toBe(true);
    expect(messages).toEqual([
      {
        data: { source: "kit-facebook-oidc", code: "facebook-oidc-code", error: null },
        origin: "https://admin.test",
      },
    ]);
  });
});
