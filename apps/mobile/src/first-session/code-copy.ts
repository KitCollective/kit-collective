/** Code screen copy (first session, e-mail step). */
export const CODE_CELL_COUNT = 6;

export function codeTitle(email: string): string {
  return `Indtast de ${CODE_CELL_COUNT} cifre, vi sendte til ${email}`;
}

export const CODE_WRONG_EMAIL_LABEL = "Forkert e-mail?";
export const CODE_INPUT_LABEL = "Kode";
export const CODE_BACK_LABEL = "Tilbage";
export const CODE_RESEND_LABEL = "Send igen";
export const CODE_RESEND_EXPIRED_LABEL = "Send ny kode";
export const CODE_WRONG_MESSAGE = "Koden passer ikke. Prøv igen, eller få en ny.";
export const CODE_EXPIRED_MESSAGE = "Koden er udløbet. Tryk på Send ny kode for at få en ny.";

/** Spoken label for the six boxes, e.g. "Kode, 3 af 6 cifre". */
export function codeProgressLabel(filled: number): string {
  return `${CODE_INPUT_LABEL}, ${filled} af ${CODE_CELL_COUNT} cifre`;
}

/** "Send igen om 0:42" while the countdown runs, "Send igen" once it is done. */
export function resendLabel(seconds: number): string {
  if (seconds <= 0) {
    return CODE_RESEND_LABEL;
  }
  const whole = Math.ceil(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return `${CODE_RESEND_LABEL} om ${minutes}:${rest}`;
}
