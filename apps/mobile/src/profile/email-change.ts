import { AUTH_THROTTLE_BANNER_MESSAGE, IdentityAuthError } from "@/auth/identity-auth-error";
import { codeFailureFromError, isCompleteCode, sanitizeCode } from "@/first-session/code-entry";

export type EmailChangeStep = "address" | "sending" | "code" | "verifying" | "done";

export type EmailChangeProblem =
  | "invalid"
  | "same"
  | "taken"
  | "wrong"
  | "expired"
  | "throttled"
  | "failed";

export type EmailChangeState = {
  step: EmailChangeStep;
  /** The new address, trimmed and lower-cased once it has been sent. */
  email: string;
  code: string;
  problem: EmailChangeProblem | null;
};

export const startEmailChange: EmailChangeState = {
  step: "address",
  email: "",
  code: "",
  problem: null,
};

// Design-system gap (KIT-510): the e-mail change copy is not locked. "taken" says nothing about
// who has an account, the same as the sign-in door.
export const EMAIL_CHANGE_PROBLEM_MESSAGE: Record<EmailChangeProblem, string> = {
  invalid: "Skriv en gyldig e-mailadresse.",
  same: "Det er allerede din e-mail.",
  taken: "Den e-mail kan ikke bruges. Prøv en anden.",
  wrong: "Koden passer ikke. Prøv igen, eller få en ny.",
  expired: "Koden er udløbet. Tryk på Send ny kode for at få en ny.",
  throttled: AUTH_THROTTLE_BANNER_MESSAGE,
  failed: "Noget gik galt. Prøv igen.",
};

const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const failedAt = (state: EmailChangeState, problem: EmailChangeProblem): EmailChangeState => ({
  ...state,
  code: "",
  problem,
});

/** Validates the typed address and, if it can be a new one, starts sending the code to it. */
export function submitAddress(
  state: EmailChangeState,
  raw: string,
  currentEmail: string,
): EmailChangeState {
  const email = raw.trim().toLowerCase();
  if (!LOOKS_LIKE_EMAIL.test(email)) {
    return { ...state, email: raw, problem: "invalid" };
  }
  if (email === currentEmail.toLowerCase()) {
    return { ...state, email: raw, problem: "same" };
  }
  return { step: "sending", email, code: "", problem: null };
}

/** The code is on its way, also after a resend: empty boxes, no old problem. */
export function codeSent(state: EmailChangeState): EmailChangeState {
  return { ...state, step: "code", code: "", problem: null };
}

/** The code could not be sent: back to the address, with the reason. */
export function sendFailed(state: EmailChangeState, error: unknown): EmailChangeState {
  const status = error instanceof IdentityAuthError ? error.status : null;
  const problem = status === 429 ? "throttled" : status === 400 ? "invalid" : "failed";
  return { ...state, step: "address", code: "", problem };
}

/** Digits only; the sixth one submits. */
export function typeCode(state: EmailChangeState, raw: string): EmailChangeState {
  if (state.step !== "code") {
    return state;
  }
  const code = sanitizeCode(raw);
  return { ...state, code, problem: null, step: isCompleteCode(code) ? "verifying" : "code" };
}

export function codeConfirmed(state: EmailChangeState): EmailChangeState {
  return { ...state, step: "done", problem: null };
}

/** 409 sends the collector back to pick another address; every other refusal stays on the code. */
export function confirmFailed(state: EmailChangeState, error: unknown): EmailChangeState {
  if (error instanceof IdentityAuthError && error.status === 409) {
    return { ...failedAt(state, "taken"), step: "address" };
  }
  return { ...failedAt(state, codeFailureFromError(error)), step: "code" };
}
