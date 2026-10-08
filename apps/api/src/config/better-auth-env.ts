/**
 * Better Auth boot env. Fails fast when unset — never use a hardcoded fallback
 * that could work in staging/production.
 */
export function requireBetterAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (secret) {
    return secret;
  }

  throw new Error(
    "BETTER_AUTH_SECRET environment variable is required. Set it in .env for local development.",
  );
}

export function requireBetterAuthUrl(): string {
  const url = process.env.BETTER_AUTH_URL?.trim();
  if (url) {
    return url;
  }

  throw new Error(
    "BETTER_AUTH_URL environment variable is required. Set it in .env for local development.",
  );
}
