import { describe, expect, it } from "vitest";
import { createSocialIdTokenRequester } from "./social-id-token.js";

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

  it("returns a Facebook token from the CDN SDK login callback", async () => {
    const request = createSocialIdTokenRequester({
      facebookAppId: "facebook-app",
      loadScript: async () => undefined,
      facebook: {
        init() {
          return;
        },
        login(callback) {
          callback({ authResponse: { authenticationToken: "facebook-id-token" } });
        },
      },
    });

    await expect(request("facebook")).resolves.toBe("facebook-id-token");
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
});
