/** Catalog entity types that carry human-readable names via CatalogLabel. */
export const CATALOG_ENTITY_TYPES = [
  "country",
  "league",
  "club",
  "national_team",
  "manufacturer",
  "patch",
  "player",
] as const;

export type CatalogEntityType = (typeof CATALOG_ENTITY_TYPES)[number];

/** Entities that can be referenced by ExternalId. */
export const EXTERNAL_ID_ENTITY_TYPES = [
  "country",
  "league",
  "club",
  "national_team",
  "player",
  "kit",
] as const;

export type ExternalIdEntityType = (typeof EXTERNAL_ID_ENTITY_TYPES)[number];

export const LABEL_LOCALES = ["da", "en", "sv", "no", "mul"] as const;
export type LabelLocale = (typeof LABEL_LOCALES)[number];

export const LABEL_KINDS = ["label", "alias"] as const;
export type LabelKind = (typeof LABEL_KINDS)[number];

export const LABEL_SOURCES = ["seed", "admin"] as const;
export type LabelSource = (typeof LABEL_SOURCES)[number];

export const KIT_TYPES = ["home", "away", "third", "gk", "special"] as const;
export type KitType = (typeof KIT_TYPES)[number];

export const CLUB_KINDS = ["club", "farm", "dissolved"] as const;
export type ClubKind = (typeof CLUB_KINDS)[number];

export const CALENDAR_KINDS = ["split_year", "calendar"] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];

export const NATIONAL_TEAM_GENDERS = ["men", "women"] as const;
export type NationalTeamGender = (typeof NATIONAL_TEAM_GENDERS)[number];

export const KIT_PHOTO_RIGHTS = ["unresolved", "cleared"] as const;
export type KitPhotoRights = (typeof KIT_PHOTO_RIGHTS)[number];

export const KIT_PHOTO_VISIBILITY = ["admin_only", "public"] as const;
export type KitPhotoVisibility = (typeof KIT_PHOTO_VISIBILITY)[number];

export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Closed set for UserJersey.size — stored value, not free text. */
export const JERSEY_SIZES = ["xs", "s", "m", "l", "xl", "xxl"] as const;
export type JerseySize = (typeof JERSEY_SIZES)[number];

/** Closed set for UserJersey.condition — stored value, not free text. */
export const JERSEY_CONDITIONS = ["new", "used", "worn"] as const;
export type JerseyCondition = (typeof JERSEY_CONDITIONS)[number];

export const PHOTO_ROLES = ["front", "back", "label"] as const;
export type PhotoRole = (typeof PHOTO_ROLES)[number];

/** Danish labels for photo role slots (UI only). */
export const PHOTO_ROLE_LABELS_DA: Record<PhotoRole, string> = {
  front: "Forside",
  back: "Bagside",
  label: "Mærke",
};

export const PHOTO_SOURCES = ["gallery", "camera"] as const;
export type PhotoSource = (typeof PHOTO_SOURCES)[number];

export const OCR_STATUSES = ["none"] as const;
export type OcrStatus = (typeof OCR_STATUSES)[number];

export const AUTHENTICITY_VALUES = ["unknown", "genuine", "replica"] as const;
export type Authenticity = (typeof AUTHENTICITY_VALUES)[number];

/** Danish chip labels for kit type (UI only — stored values are KIT_TYPES). */
export const KIT_TYPE_LABELS_DA: Record<KitType, string> = {
  home: "Hjemme",
  away: "Ude",
  third: "Tredje",
  gk: "Keeper",
  special: "Special",
};

/** Danish chip labels for jersey size (UI only). */
export const JERSEY_SIZE_LABELS_DA: Record<JerseySize, string> = {
  xs: "XS",
  s: "S",
  m: "M",
  l: "L",
  xl: "XL",
  xxl: "XXL",
};

/** Danish chip labels for jersey condition (UI only). */
export const JERSEY_CONDITION_LABELS_DA: Record<JerseyCondition, string> = {
  new: "Ny",
  used: "Brugt",
  worn: "Slidt",
};

export { ENTITLEMENT_SOURCES, type EntitlementSource } from "./billing.js";
export {
  HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH,
  HANDLE_PATTERN,
  HANDLE_STATUSES,
  type HandleStatus,
} from "./identity.js";
export {
  COUNTRY_LABEL_TO_ISO3166,
  formatProfileLocationCaption,
  formatProfileLocationMeta,
  POPULAR_CITIES_BY_ISO3166,
  popularCitiesForCountry,
  popularCitiesForCountryLabel,
} from "./location.js";
export {
  APPEARANCE_MODES,
  type AppearanceMode,
  USER_LOCALES,
  type UserLocale,
} from "./prefs.js";
