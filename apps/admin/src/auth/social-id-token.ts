import type { IdentityLinkedProvider } from "@kit/api-contract";

const GOOGLE_GIS_SRC = "https://accounts.google.com/gsi/client";
const FACEBOOK_SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";
const FACEBOOK_SDK_VERSION = "v21.0";

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleAccountsId = {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    ux_mode?: "popup" | "redirect";
  }) => void;
  prompt: (
    listener?: (notification: {
      isNotDisplayed: () => boolean;
      isSkippedMoment: () => boolean;
      isDismissedMoment: () => boolean;
    }) => void,
  ) => void;
};

type FacebookAuthResponse = {
  accessToken?: string;
  authenticationToken?: string;
  id_token?: string;
};

type FacebookSdk = {
  init: (params: { appId: string; cookie?: boolean; xfbml?: boolean; version: string }) => void;
  login: (
    callback: (response: { authResponse?: FacebookAuthResponse | null }) => void,
    options?: { scope: string },
  ) => void;
};

export type SocialIdTokenHost = {
  googleClientId?: string;
  facebookAppId?: string;
  loadScript?: (src: string) => Promise<void>;
  google?: { accounts: { id: GoogleAccountsId } };
  facebook?: FacebookSdk;
};

export type SocialIdTokenRequester = (provider: IdentityLinkedProvider) => Promise<string>;

function readGoogleClientId(host: SocialIdTokenHost): string | undefined {
  return host.googleClientId ?? import.meta.env.VITE_GOOGLE_CLIENT_ID;
}

function readFacebookAppId(host: SocialIdTokenHost): string | undefined {
  return host.facebookAppId ?? import.meta.env.VITE_FACEBOOK_APP_ID;
}

function loadScriptOnce(src: string): Promise<void> {
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Sign in failed"));
    document.head.append(script);
  });
}

function facebookIdToken(auth: FacebookAuthResponse | null | undefined): string | undefined {
  return auth?.id_token ?? auth?.authenticationToken;
}

async function requestGoogleIdToken(host: SocialIdTokenHost): Promise<string> {
  const clientId = readGoogleClientId(host);
  if (!clientId) {
    throw new Error("Google sign-in is not configured");
  }

  await (host.loadScript ?? loadScriptOnce)(GOOGLE_GIS_SRC);
  const googleId = host.google?.accounts.id ?? window.google?.accounts.id;
  if (!googleId) {
    throw new Error("Sign in failed");
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const succeed = (token: string) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(token);
    };
    const fail = (message: string) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error(message));
    };

    googleId.initialize({
      client_id: clientId,
      auto_select: false,
      cancel_on_tap_outside: true,
      ux_mode: "popup",
      callback: (response) => {
        if (response.credential) {
          succeed(response.credential);
          return;
        }
        fail("Sign in failed");
      },
    });
    googleId.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        fail("Google sign-in is unavailable");
      }
      if (notification.isDismissedMoment()) {
        fail("Google sign-in was cancelled");
      }
    });
  });
}

async function requestFacebookIdToken(host: SocialIdTokenHost): Promise<string> {
  const appId = readFacebookAppId(host);
  if (!appId) {
    throw new Error("Facebook sign-in is not configured");
  }

  await (host.loadScript ?? loadScriptOnce)(FACEBOOK_SDK_SRC);
  const facebook = host.facebook ?? window.FB;
  if (!facebook) {
    throw new Error("Sign in failed");
  }

  facebook.init({
    appId,
    cookie: true,
    xfbml: false,
    version: FACEBOOK_SDK_VERSION,
  });

  return new Promise((resolve, reject) => {
    facebook.login(
      (response) => {
        const token = facebookIdToken(response.authResponse);
        if (token) {
          resolve(token);
          return;
        }
        reject(new Error("Facebook sign-in was cancelled"));
      },
      { scope: "email,public_profile" },
    );
  });
}

export function createSocialIdTokenRequester(host: SocialIdTokenHost = {}): SocialIdTokenRequester {
  return async (provider) => {
    if (provider === "google") {
      return requestGoogleIdToken(host);
    }
    return requestFacebookIdToken(host);
  };
}

export const requestSocialIdToken: SocialIdTokenRequester = createSocialIdTokenRequester();

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
    FB?: FacebookSdk;
  }
}
