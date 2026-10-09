/** Danish collector copy for the welcome screen and the try-it demo. */
export const WELCOME_HEADLINE = "Fra foto til trøje på sekunder";
export const WELCOME_EXAMPLES_CAPTION = "Prøv med en eksempeltrøje";
export const WELCOME_OWN_PHOTO_LABEL = "Brug mit eget foto";
export const WELCOME_HAVE_ACCOUNT_LABEL = "Jeg har allerede en konto";

export const DEMO_ROW_LABELS = {
  club: "Klub",
  season: "Sæson",
  type: "Type",
} as const;

export const DEMO_EXAMPLE_MARK = "Eksempel · ikke gemt";
export const DEMO_START_LABEL = "Kom i gang";
export const DEMO_ANOTHER_LABEL = "Prøv en anden trøje";

export function exampleTileLabel(clubLabel: string, seasonLabel: string): string {
  return `Prøv med ${clubLabel} ${seasonLabel}`;
}
