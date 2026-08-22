const LOCAL_EXPO_ORIGINS = [
  "http://localhost:8081",
  "http://localhost:19006",
  "http://127.0.0.1:8081",
  "http://127.0.0.1:19006",
] as const;

/**
 * Allowed browser origins for credentialed CORS.
 * Production/staging must set CORS_ALLOWED_ORIGINS explicitly.
 */
export function corsAllowedOrigins(): readonly string[] | false {
  const raw = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (raw) {
    return raw
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }

  if (process.env.NODE_ENV === "production") {
    return false;
  }

  return LOCAL_EXPO_ORIGINS;
}

export function isCorsOriginAllowed(origin: string | undefined): boolean {
  if (!origin) {
    return true;
  }

  const allowed = corsAllowedOrigins();
  if (allowed === false) {
    return false;
  }

  return allowed.includes(origin);
}
