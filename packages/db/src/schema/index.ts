import {
  AUTHENTICITY_VALUES,
  CALENDAR_KINDS,
  CATALOG_ENTITY_TYPES,
  CLUB_KINDS,
  EXTERNAL_ID_ENTITY_TYPES,
  JERSEY_CONDITIONS,
  JERSEY_SIZES,
  KIT_PHOTO_RIGHTS,
  KIT_PHOTO_VISIBILITY,
  KIT_TYPES,
  LABEL_KINDS,
  LABEL_LOCALES,
  LABEL_SOURCES,
  NATIONAL_TEAM_GENDERS,
  OCR_STATUSES,
  PHOTO_ROLES,
  PHOTO_SOURCES,
  USER_ROLES,
} from "@kit/domain";
import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const VISION_JOB_STATUSES = ["pending", "ready", "failed", "noop"] as const;
const VISION_USER_ACTIONS = ["accepted", "edited", "ignored"] as const;
const MESSAGE_KINDS = ["text", "image", "bid"] as const;
const BID_STATUSES = ["pending", "accepted", "declined"] as const;

export const catalogEntityTypeEnum = pgEnum("catalog_entity_type", CATALOG_ENTITY_TYPES);
export const externalIdEntityTypeEnum = pgEnum("external_id_entity_type", EXTERNAL_ID_ENTITY_TYPES);
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
export const jerseySizeEnum = pgEnum("jersey_size", JERSEY_SIZES);
export const jerseyConditionEnum = pgEnum("jersey_condition", JERSEY_CONDITIONS);
export const photoRoleEnum = pgEnum("photo_role", PHOTO_ROLES);
export const photoSourceEnum = pgEnum("photo_source", PHOTO_SOURCES);
export const ocrStatusEnum = pgEnum("ocr_status", OCR_STATUSES);
export const authenticityEnum = pgEnum("authenticity", AUTHENTICITY_VALUES);
export const visionJobStatusEnum = pgEnum("vision_job_status", VISION_JOB_STATUSES);
export const visionUserActionEnum = pgEnum("vision_user_action", VISION_USER_ACTIONS);
export const messageKindEnum = pgEnum("message_kind", MESSAGE_KINDS);
export const bidStatusEnum = pgEnum("bid_status", BID_STATUSES);

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
  (table) => [uniqueIndex("team_season_club_season_unique").on(table.clubId, table.seasonId)],
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
    uniqueIndex("player_club_season_unique").on(table.playerId, table.clubId, table.seasonId),
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
    handle: text("handle").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_email_unique").on(table.email),
    uniqueIndex("user_handle_unique").on(table.handle),
  ],
);

export const userJersey = pgTable("user_jersey", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id),
  clubId: uuid("club_id")
    .notNull()
    .references(() => club.id),
  seasonId: uuid("season_id")
    .notNull()
    .references(() => season.id),
  catalogKitId: uuid("catalog_kit_id").references(() => kit.id),
  type: kitTypeEnum("type").notNull(),
  size: jerseySizeEnum("size").notNull(),
  condition: jerseyConditionEnum("condition").notNull(),
  authenticity: authenticityEnum("authenticity").notNull().default("unknown"),
  notes: text("notes"),
  draftId: uuid("draft_id"),
  biddingEnabled: boolean("bidding_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversation = pgTable(
  "conversation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userJerseyId: uuid("user_jersey_id")
      .notNull()
      .references(() => userJersey.id),
    lowerCollectorId: uuid("lower_collector_id")
      .notNull()
      .references(() => user.id),
    upperCollectorId: uuid("upper_collector_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("conversation_jersey_pair_unique").on(
      table.userJerseyId,
      table.lowerCollectorId,
      table.upperCollectorId,
    ),
  ],
);

export const conversationParticipant = pgTable(
  "conversation_participant",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversation.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.conversationId, table.userId] })],
);

export const conversationMessage = pgTable("conversation_message", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversation.id),
  senderId: uuid("sender_id")
    .notNull()
    .references(() => user.id),
  kind: messageKindEnum("kind").notNull(),
  body: text("body"),
  bidAmountDkk: integer("bid_amount_dkk"),
  bidStatus: bidStatusEnum("bid_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userJerseyPhoto = pgTable("user_jersey_photo", {
  id: uuid("id").primaryKey().defaultRandom(),
  userJerseyId: uuid("user_jersey_id")
    .notNull()
    .references(() => userJersey.id),
  objectKey: text("object_key").notNull(),
  role: photoRoleEnum("role").notNull(),
  source: photoSourceEnum("source").notNull(),
  ocrStatus: ocrStatusEnum("ocr_status").notNull().default("none"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const visionLog = pgTable("vision_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id),
  draftId: uuid("draft_id"),
  userJerseyId: uuid("user_jersey_id").references(() => userJersey.id),
  status: visionJobStatusEnum("status").notNull().default("pending"),
  suggestedClubId: uuid("suggested_club_id").references(() => club.id),
  suggestedSeasonId: uuid("suggested_season_id").references(() => season.id),
  suggestedCatalogKitId: uuid("suggested_catalog_kit_id").references(() => kit.id),
  suggestedType: kitTypeEnum("suggested_type"),
  visionRaw: text("vision_raw"),
  confidences: text("confidences"),
  latencyMs: integer("latency_ms"),
  model: text("model"),
  userAction: visionUserActionEnum("user_action"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jerseyDraft = pgTable(
  "jersey_draft",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    userJerseyId: uuid("user_jersey_id").references(() => userJersey.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("jersey_draft_user_id_unique").on(table.userId, table.id)],
);

export const collectionShortcut = pgTable("collection_shortcut", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  countryId: uuid("country_id").references(() => country.id),
  leagueId: uuid("league_id").references(() => league.id),
  clubId: uuid("club_id").references(() => club.id),
  playerId: uuid("player_id").references(() => player.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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

export const userRelations = relations(user, ({ many }) => ({
  jerseys: many(userJersey),
  shortcuts: many(collectionShortcut),
}));

export const collectionShortcutRelations = relations(collectionShortcut, ({ one }) => ({
  user: one(user, { fields: [collectionShortcut.userId], references: [user.id] }),
  country: one(country, { fields: [collectionShortcut.countryId], references: [country.id] }),
  league: one(league, { fields: [collectionShortcut.leagueId], references: [league.id] }),
  club: one(club, { fields: [collectionShortcut.clubId], references: [club.id] }),
  player: one(player, { fields: [collectionShortcut.playerId], references: [player.id] }),
}));

export const userJerseyRelations = relations(userJersey, ({ one, many }) => ({
  user: one(user, { fields: [userJersey.userId], references: [user.id] }),
  club: one(club, { fields: [userJersey.clubId], references: [club.id] }),
  season: one(season, { fields: [userJersey.seasonId], references: [season.id] }),
  catalogKit: one(kit, { fields: [userJersey.catalogKitId], references: [kit.id] }),
  photos: many(userJerseyPhoto),
}));

export const userJerseyPhotoRelations = relations(userJerseyPhoto, ({ one }) => ({
  userJersey: one(userJersey, {
    fields: [userJerseyPhoto.userJerseyId],
    references: [userJersey.id],
  }),
}));

export const visionLogRelations = relations(visionLog, ({ one }) => ({
  user: one(user, { fields: [visionLog.userId], references: [user.id] }),
  userJersey: one(userJersey, {
    fields: [visionLog.userJerseyId],
    references: [userJersey.id],
  }),
  suggestedClub: one(club, { fields: [visionLog.suggestedClubId], references: [club.id] }),
  suggestedSeason: one(season, {
    fields: [visionLog.suggestedSeasonId],
    references: [season.id],
  }),
  suggestedCatalogKit: one(kit, {
    fields: [visionLog.suggestedCatalogKitId],
    references: [kit.id],
  }),
}));

export const jerseyDraftRelations = relations(jerseyDraft, ({ one }) => ({
  user: one(user, { fields: [jerseyDraft.userId], references: [user.id] }),
  userJersey: one(userJersey, {
    fields: [jerseyDraft.userJerseyId],
    references: [userJersey.id],
  }),
}));
