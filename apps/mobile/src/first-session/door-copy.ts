export type DoorSocialProvider = "google" | "facebook";

/** One sheet for every way into an account. */
export const DOOR_TITLE = "Kom i gang";

export const DOOR_EMAIL_LABEL = "E-mail";
export const DOOR_EMAIL_PLACEHOLDER = "dig@eksempel.dk";
export const DOOR_SUBMIT_LABEL = "Fortsæt";
export const DOOR_DIVIDER_LABEL = "eller";
export const DOOR_EMAIL_INVALID = "Skriv en gyldig e-mail";
export const DOOR_TERMS_LINE =
  "Når du fortsætter, accepterer du vilkårene og privatlivspolitikken.";

export const DOOR_PROVIDER_LABEL: Record<DoorSocialProvider, string> = {
  google: "Google",
  facebook: "Facebook",
};

export const CODE_STUB_TITLE = "Tjek din e-mail";
export const CODE_STUB_BACK_LABEL = "Tilbage";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Syntactic check only: something@domain.tld. The server decides whether the address exists. */
export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/** Bottom-toast copy when a provider sign-in is cancelled or fails. */
export function socialCancelledMessage(provider: DoorSocialProvider): string {
  return `${DOOR_PROVIDER_LABEL[provider]}-login blev afbrudt`;
}
