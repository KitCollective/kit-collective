import Constants from "expo-constants";

const fallbackApiUrl = "http://localhost:3000";

export function getApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv.replace(/\/$/, "");
  }

  const extra = Constants.expoConfig?.extra;
  // SAFETY: app.json extra is a plain object at build time; only optional apiUrl is read.
  const apiUrl =
    extra && typeof extra === "object" && "apiUrl" in extra && typeof extra.apiUrl === "string"
      ? extra.apiUrl
      : undefined;

  if (apiUrl) {
    return apiUrl.replace(/\/$/, "");
  }

  return fallbackApiUrl;
}
