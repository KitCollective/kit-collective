import type { DoorMode } from "@/first-session/session";

export type { DoorMode };
export type DoorSocialProvider = "google" | "facebook";

/** Two-mode title switcher segments (Login ↔ Opret). */
export const DOOR_LOGIN_SEGMENT = "Login";
export const DOOR_REGISTER_SEGMENT = "Opret";

/** Accessible title fallback for the door face (switcher carries the visible labels). */
export function doorTitle(mode: DoorMode): string {
  return mode === "login" ? DOOR_LOGIN_SEGMENT : DOOR_REGISTER_SEGMENT;
}

export function doorSwapLabel(mode: DoorMode): string {
  return mode === "login" ? "Ny her? Opret konto" : "Har du en konto? Login";
}

export function doorPasswordSubmitLabel(mode: DoorMode): string {
  return mode === "login" ? "Login" : "Opret konto";
}

export const SPLASH_CAPTION = "Tryk for at fortsætte";
export const SPLASH_LOGIN_LABEL = "Login";
export const SPLASH_REGISTER_LABEL = "Opret konto";
export const DOOR_SPLITTER_LABEL = "eller";
export const PASSWORD_REPEAT_LABEL = "Gentag adgangskode";
export const PASSWORD_HELPER = "mindst 8 tegn";
export const FORGOT_PASSWORD_LABEL = "Glemt adgangskode?";

/** Forgot-password page presented in-sheet (page-in-a-sheet, not a route push). */
export const FORGOT_PASSWORD_TITLE = "Nulstil adgangskode";
export const FORGOT_PASSWORD_INFO =
  "Vi sender et link, hvis e-mailen findes. Samme svar hver gang.";
export const FORGOT_PASSWORD_SUBMIT = "Send link";
export const FORGOT_PASSWORD_DONE = "Tjek din e-mail, hvis kontoen findes.";
export const FORGOT_PASSWORD_BACK = "Tilbage";

export const VERIFY_EMAIL_TITLE = "Tjek din e-mail";
export const VERIFY_EMAIL_BODY = "Vi har sendt et link. Du kan fortsætte nu.";
export const VERIFY_EMAIL_CONTINUE = "Fortsæt";
