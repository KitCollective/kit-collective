import type { IdentityLinkedProvider } from "@kit/api-contract";

function requiredPublicEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error("Social login er ikke konfigureret");
  }
  return value;
}

async function requestGoogleNativeIdToken(): Promise<string> {
  const { GoogleSignin } = await import("@react-native-google-signin/google-signin");
  GoogleSignin.configure({
    iosClientId: requiredPublicEnv("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID"),
    webClientId: requiredPublicEnv("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID"),
  });
  await GoogleSignin.hasPlayServices();
  const result = await GoogleSignin.signIn();
  if (result.type !== "success" || !result.data.idToken) {
    throw new Error("Kunne ikke logge ind");
  }
  return result.data.idToken;
}

async function requestFacebookNativeIdToken(): Promise<string> {
  requiredPublicEnv("EXPO_PUBLIC_FACEBOOK_APP_ID");
  const { LoginManager, AuthenticationToken } = await import("react-native-fbsdk-next");
  LoginManager.setLoginBehavior("native_only");
  const login = await LoginManager.logInWithPermissions(
    ["public_profile", "email"],
    "limited",
  );
  if (login.isCancelled) {
    throw new Error("Kunne ikke logge ind");
  }
  const limited = await AuthenticationToken.getAuthenticationTokenIOS();
  const token = limited?.authenticationToken;
  if (!token) {
    throw new Error("Kunne ikke logge ind");
  }
  return token;
}

export async function requestNativeIdToken(provider: IdentityLinkedProvider): Promise<string> {
  if (provider === "google") {
    return requestGoogleNativeIdToken();
  }
  return requestFacebookNativeIdToken();
}
