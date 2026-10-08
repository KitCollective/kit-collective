import type { IdentityLinkedProvider } from "@kit/api-contract";

const GOOGLE_GIS_SRC = "https://accounts.google.com/gsi/client";
const FACEBOOK_OAUTH_DIALOG = "https://www.facebook.com/v21.0/dialog/oauth";
const FACEBOOK_OIDC_SOURCE = "kit-facebook-oidc";

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

export type FacebookOidcRedirectHost = {
  opener: { postMessage: (data: unknown, origin: string) => void } | null;
  location: { search: string; origin: string };
  close: () => void;
};

export type SocialIdTokenHost = {
  googleClientId?: string;
  facebookAppId?: string;
  facebookRedirectUri?: string;
  loadScript?: (src: string) => Promise<void>;
  google?: { accounts: { id: GoogleAccountsId } };
  requestFacebookAuthorizationCode?: (params: {
    appId: string;
    redirectUri: string;
  }) => Promise<string>;
  facebookOidcWindow?: Pick<Window, "addEventListener" | "removeEventListener" | "open" | "origin">;
};

export type SocialIdTokenRequester = (provider: IdentityLinkedProvider) => Promise<string>;

function readGoogleClientId(host: SocialIdTokenHost): string | undefined {
  return host.googleClientId ?? import.meta.env.VITE_GOOGLE_CLIENT_ID;
}

function readFacebookAppId(host: SocialIdTokenHost): string | undefined {
  return host.facebookAppId ?? import.meta.env.VITE_FACEBOOK_APP_ID;
}

function readFacebookRedirectUri(host: SocialIdTokenHost): string {
  return (
    host.facebookRedirectUri ??
    import.meta.env.VITE_FACEBOOK_REDIRECT_URI ??
    `${window.location.origin}/login`
  );
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

export function maybeCompleteFacebookOidcRedirect(
  host: FacebookOidcRedirectHost = window,
): boolean {
  if (!host.opener) {
    return false;
  }
  const params = new URLSearchParams(host.location.search);
  const code = params.get("code");
  const error = params.get("error");
  if (!code && !error) {
    return false;
  }
  host.opener.postMessage({ source: FACEBOOK_OIDC_SOURCE, code, error }, host.location.origin);
  host.close();
  return true;
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

function openFacebookOidcDialog(
  host: SocialIdTokenHost,
  appId: string,
  redirectUri: string,
): Promise<string> {
  const target = host.facebookOidcWindow ?? window;
  const dialog = new URL(FACEBOOK_OAUTH_DIALOG);
  dialog.searchParams.set("client_id", appId);
  dialog.searchParams.set("redirect_uri", redirectUri);
  dialog.searchParams.set("response_type", "code");
  dialog.searchParams.set("scope", "openid email public_profile");

  return new Promise((resolve, reject) => {
    const popup = target.open(dialog.toString(), "facebook-oidc", "width=480,height=720");
    if (!popup) {
      reject(new Error("Facebook sign-in is unavailable"));
      return;
    }

    const fail = (message: string) => {
      target.removeEventListener("message", onMessage);
      reject(new Error(message));
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== target.origin) {
        return;
      }
      const data = event.data;
      if (typeof data !== "object" || data === null || !("source" in data)) {
        return;
      }
      if (data.source !== FACEBOOK_OIDC_SOURCE) {
        return;
      }
      target.removeEventListener("message", onMessage);
      const code = "code" in data && typeof data.code === "string" ? data.code : "";
      if (code) {
        resolve(code);
        return;
      }
      fail("Facebook sign-in was cancelled");
    };
    target.addEventListener("message", onMessage);
  });
}

async function requestFacebookAuthorizationCode(host: SocialIdTokenHost): Promise<string> {
  const appId = readFacebookAppId(host);
  if (!appId) {
    throw new Error("Facebook sign-in is not configured");
  }
  const redirectUri = readFacebookRedirectUri(host);
  if (host.requestFacebookAuthorizationCode) {
    return host.requestFacebookAuthorizationCode({ appId, redirectUri });
  }
  return openFacebookOidcDialog(host, appId, redirectUri);
}

export function createSocialIdTokenRequester(host: SocialIdTokenHost = {}): SocialIdTokenRequester {
  return async (provider) => {
    if (provider === "google") {
      return requestGoogleIdToken(host);
    }
    return requestFacebookAuthorizationCode(host);
  };
}

export const requestSocialIdToken: SocialIdTokenRequester = createSocialIdTokenRequester();

if (typeof window !== "undefined") {
  maybeCompleteFacebookOidcRedirect();
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}
