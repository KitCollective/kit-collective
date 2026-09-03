import type { DoorMode } from "@/first-session/session";

export type { DoorMode };
export type DoorEmailStep = "choose" | 1 | 2;
export type DoorSocialProvider = "google" | "facebook";

export function doorTitle(mode: DoorMode): string {
  return mode === "login" ? "Log ind" : "Gem samlingen";
}

export function doorSentence(mode: DoorMode): string {
  return mode === "login" ? "Samlingen venter." : "Trøjen er læst. En konto husker den.";
}

export function doorEmailCtaLabel(mode: DoorMode): string {
  return mode === "login" ? "Log ind med e-mail" : "Opret med e-mail";
}

export function doorSwapLabel(mode: DoorMode): string {
  return mode === "login" ? "Ny her? Opret konto" : "Jeg har en konto";
}

export function doorStepCaption(step: 1 | 2): string {
  return step === 1 ? "1/2" : "2/2";
}

export function doorPasswordSubmitLabel(mode: DoorMode): string {
  return mode === "login" ? "Log ind" : "Opret konto";
}

export const SPLASH_CAPTION = "Tryk for at fortsætte";
export const SPLASH_LOGIN_LABEL = "Log ind";
export const SPLASH_REGISTER_LABEL = "Opret konto";
export const DOOR_SPLITTER_LABEL = "eller";
export const EMAIL_NEXT_LABEL = "Næste";
export const EMAIL_CHANGE_LABEL = "Skift";
export const PASSWORD_REPEAT_LABEL = "Gentag adgangskode";
export const PASSWORD_HELPER = "mindst 8 tegn";
export const FORGOT_PASSWORD_LABEL = "Glemt adgangskode?";
export const VERIFY_EMAIL_TITLE = "Tjek din e-mail";
export const VERIFY_EMAIL_BODY = "Vi har sendt et link. Du kan fortsætte nu.";
export const VERIFY_EMAIL_CONTINUE = "Fortsæt";
