import {
  CALENDAR_KINDS,
  CLUB_KINDS,
  CATALOG_ENTITY_TYPES,
  EXTERNAL_ID_ENTITY_TYPES,
  KIT_PHOTO_RIGHTS,
  KIT_PHOTO_VISIBILITY,
  KIT_TYPES,
  LABEL_KINDS,
  LABEL_LOCALES,
  LABEL_SOURCES,
  NATIONAL_TEAM_GENDERS,
  USER_ROLES,
} from "@kit/domain";
import { relations, sql } from "drizzle-orm";
import {
  date,
  integer,
  type AnyPgColumn,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const catalogEntityTypeEnum = pgEnum("catalog_entity_type", CATALOG_ENTITY_TYPES);
export const externalIdEntityTypeEnum = pgEnum(
  "external_id_entity_type",
  EXTERNAL_ID_ENTITY_TYPES,
);
export const labelLocaleEnum = pgEnum("label_locale", LABEL_LOCALES);
export const labelKindEnum = pgEnum("label_kind", LABEL_KINDS);
export const labelSourceEnum = pgEnum("label_source", LABEL_SOURCES);
export const kitTypeEnum = pgEnum("kit_type", KIT_TYPES);
export const clubKindEnum = pgEnum("club_kind", CLUB_KINDS);
export const calendarKindEnum = pgEnum("calendar_kind", CALENDAR_KINDS);
export const nationalTeamGenderEnum = pgEnum("national_team_gender", NATIONAL_TEAM_GENDERS);
export const kitPhotoRightsEnum = pgEnum("kit_photo_rights", KIT_PHOTO_RIGHTS);
export const kitPhotoVisibilityEnum = pgEnum("kit_photo_visibility", KIT_PHOTO_VISIBILITY);
export const userRoleEnum = pgEnum("user_role", USER_ROLES);

export const country = pgTable("country", {
  id: uuid("id").primaryKey().defaultRandom(),
  iso3166: text("iso3166").notNull(),
  validFrom: date("valid_from"),
  validTo: date("valid_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const league = pgTable("league", {
  id: uuid("id").primaryKey().defaultRandom(),
  countryId: uuid("country_id")
    .notNull()
    .references(() => country.id),
  validFrom: date("valid_from"),
  validTo: date("valid_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const club = pgTable("club", {
  id: uuid("id").primaryKey().defaultRandom(),
  countryId: uuid("country_id")
    .notNull()
    .references(() => country.id),
  kind: clubKindEnum("kind").notNull().default("club"),
  successorClubId: uuid("successor_club_id").references((): AnyPgColumn => club.id),
  validFrom: date("valid_from"),
  validTo: date("valid_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const nationalTeam = pgTable("national_team", {
  id: uuid("id").primaryKey().defaultRandom(),
  countryId: uuid("country_id")
    .notNull()
    .references(() => country.id),
  gender: nationalTeamGenderEnum("gender").notNull(),
  validFrom: date("valid_from"),
  validTo: date("valid_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const season = pgTable("season", {
  id: uuid("id").primaryKey().defaultRandom(),
  leagueId: uuid("league_id").references(() => league.id),
  label: text("label").notNull(),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  calendarKind: calendarKindEnum("calendar_kind").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teamSeason = pgTable(
  "team_season",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => club.id),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => season.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("team_season_club_season_unique").on(table.clubId, table.seasonId),
  ],
);

export const player = pgTable("player", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const playerClubSeason = pgTable(
  "player_club_season",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => player.id),
    clubId: uuid("club_id")
      .notNull()
      .references(() => club.id),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => season.id),
    squadNumber: integer("squad_number"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("player_club_season_unique").on(
      table.playerId,
      table.clubId,
      table.seasonId,
    ),
  ],
);

export const manufacturer = pgTable("manufacturer", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const kit = pgTable("kit", {
  id: uuid("id").primaryKey().defaultRandom(),
  clubId: uuid("club_id").references(() => club.id),
  nationalTeamId: uuid("national_team_id").references(() => nationalTeam.id),
  seasonId: uuid("season_id")
    .notNull()
    .references(() => season.id),
  type: kitTypeEnum("type").notNull(),
  manufacturerId: uuid("manufacturer_id").references(() => manufacturer.id),
  sponsorName: text("sponsor_name"),
  validFrom: date("valid_from"),
  validTo: date("valid_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const kitPhoto = pgTable("kit_photo", {
  id: uuid("id").primaryKey().defaultRandom(),
  kitId: uuid("kit_id")
    .notNull()
    .references(() => kit.id),
  objectKey: text("object_key").notNull(),
  rights: kitPhotoRightsEnum("rights").notNull().default("unresolved"),
  visibility: kitPhotoVisibilityEnum("visibility").notNull().default("admin_only"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const catalogLabel = pgTable(
  "catalog_label",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: catalogEntityTypeEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    locale: labelLocaleEnum("locale").notNull(),
    kind: labelKindEnum("kind").notNull(),
    text: text("text").notNull(),
    source: labelSourceEnum("source").notNull().default("seed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("catalog_label_entity_locale_label_unique")
      .on(table.entityType, table.entityId, table.locale)
      .where(sql`kind = 'label'`),
    uniqueIndex("catalog_label_entity_locale_alias_text_unique")
      .on(table.entityType, table.entityId, table.locale, table.text)
      .where(sql`kind = 'alias'`),
  ],
);

export const externalId = pgTable(
  "external_id",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: externalIdEntityTypeEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    system: text("system").notNull(),
    value: text("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("external_id_system_value_unique").on(table.system, table.value)],
);

export const user = pgTable(
  "user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("user_email_unique").on(table.email)],
);

export const countryRelations = relations(country, ({ many }) => ({
  leagues: many(league),
  clubs: many(club),
  nationalTeams: many(nationalTeam),
}));

export const leagueRelations = relations(league, ({ one, many }) => ({
  country: one(country, { fields: [league.countryId], references: [country.id] }),
  seasons: many(season),
}));

export const clubRelations = relations(club, ({ one, many }) => ({
  country: one(country, { fields: [club.countryId], references: [country.id] }),
  successorClub: one(club, {
    fields: [club.successorClubId],
    references: [club.id],
    relationName: "successor",
  }),
  teamSeasons: many(teamSeason),
  kits: many(kit),
}));

export const seasonRelations = relations(season, ({ one, many }) => ({
  league: one(league, { fields: [season.leagueId], references: [league.id] }),
  teamSeasons: many(teamSeason),
  kits: many(kit),
}));

export const kitRelations = relations(kit, ({ one, many }) => ({
  club: one(club, { fields: [kit.clubId], references: [club.id] }),
  nationalTeam: one(nationalTeam, {
    fields: [kit.nationalTeamId],
    references: [nationalTeam.id],
  }),
  season: one(season, { fields: [kit.seasonId], references: [season.id] }),
  manufacturer: one(manufacturer, {
    fields: [kit.manufacturerId],
    references: [manufacturer.id],
  }),
  photos: many(kitPhoto),
}));
