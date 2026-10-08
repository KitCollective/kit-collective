/** Collector UI locale — aligns CatalogLabel request locale and chrome. */
export const USER_LOCALES = ["da", "en", "sv", "no"] as const;
export type UserLocale = (typeof USER_LOCALES)[number];

export const APPEARANCE_MODES = ["system", "light", "dark"] as const;
export type AppearanceMode = (typeof APPEARANCE_MODES)[number];
