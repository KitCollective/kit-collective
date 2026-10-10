import { IdentityAuthError } from "@/auth/identity-auth-error";

/** Digits in the e-mail sign-in code. Mirrors `IDENTITY_CODE_LENGTH` in the API contract. */
export const CODE_LENGTH = 6;

/** Seconds Send igen stays disabled after a code was sent. Not set by the design lock: flagged on KIT-275. */
export const RESEND_COUNTDOWN_SECONDS = 30;

/** Shown when a code could not be requested or checked for a reason that is not the code itself. */
export const CODE_REQUEST_FAILED = "Kunne ikke sende koden. Prøv igen.";
export const CODE_VERIFY_FAILED = "Kunne ikke tjekke koden. Prøv igen.";

/** Digits only, at most six: handles paste, autofill with spaces and a hardware keyboard. */
export function sanitizeCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

export function isCompleteCode(code: string): boolean {
  return code.length === CODE_LENGTH;
}

export type CodeFailure = "wrong" | "expired" | "throttled" | "failed";

/**
 * What the collector sees after a code was refused: 401 is a wrong code, 410 an expired one (or
 * none), 429 too many attempts. Anything else, such as no connection, is not the code's fault.
 */
export function codeFailureFromError(error: unknown): CodeFailure {
  if (!(error instanceof IdentityAuthError)) {
    return "failed";
  }
  if (error.status === 401) {
    return "wrong";
  }
  if (error.status === 410) {
    return "expired";
  }
  if (error.status === 429) {
    return "throttled";
  }
  return "failed";
}

/** One tick of the Send igen countdown. */
export function nextCountdown(seconds: number): number {
  return Math.max(0, seconds - 1);
}
