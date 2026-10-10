/**
 * How long an e-mail sign-in code lives and how many wrong guesses it survives.
 * Values are read from the environment so they change without a deploy of code;
 * Nicklas confirmed the defaults (10 minutes, 5 attempts) on KIT-275.
 */
const DEFAULT_CODE_EXPIRY_MINUTES = 10;
const DEFAULT_CODE_MAX_ATTEMPTS = 5;

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

export function identityCodeExpiryMinutes(): number {
  return positiveInteger("IDENTITY_CODE_EXPIRY_MINUTES", DEFAULT_CODE_EXPIRY_MINUTES);
}

export function identityCodeMaxAttempts(): number {
  return positiveInteger("IDENTITY_CODE_MAX_ATTEMPTS", DEFAULT_CODE_MAX_ATTEMPTS);
}
