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
