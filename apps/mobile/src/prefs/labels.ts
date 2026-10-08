import type { UserLocale } from "@kit/domain";

export const LOCALE_LABELS: Record<UserLocale, string> = {
  da: "Dansk",
  en: "English",
  sv: "Svenska",
  no: "Norsk",
};

export const APPEARANCE_LABELS = {
  system: "Systemindstilling",
  light: "Lys",
  dark: "Mørk",
} as const;

export function localeLabel(locale: UserLocale): string {
  return LOCALE_LABELS[locale];
}

export function appearanceLabel(appearance: keyof typeof APPEARANCE_LABELS): string {
  return APPEARANCE_LABELS[appearance];
}
