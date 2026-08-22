/**
 * JWT signing secret for Identity sessions.
 * Fails fast when unset — never use a hardcoded fallback that could work in staging/production.
 */
export function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret) {
    return secret;
  }

  throw new Error(
    "JWT_SECRET environment variable is required. Set it in .env for local development.",
  );
}
