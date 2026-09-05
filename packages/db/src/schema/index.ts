import {
  APPEARANCE_MODES,
  AUTH_EVENT_KINDS,
  AUTHENTICITY_VALUES,
  CALENDAR_KINDS,
  CATALOG_ENTITY_TYPES,
  CLUB_KINDS,
  ENTITLEMENT_SOURCES,
  EXTERNAL_ID_ENTITY_TYPES,
  HONOUR_SUBJECT_TYPES,
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
  PREFERRED_FOOT,
  USER_LOCALES,
  USER_ROLES,
} from "@kit/domain";
import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const VISION_JOB_STATUSES = ["pending", "ready", "failed", "noop"] as const;
const VISION_USER_ACTIONS = ["accepted", "edited", "ignored"] as const;
const MESSAGE_KINDS = ["text", "image", "bid"] as const;
const BID_STATUSES = ["pending", "accepted", "declined"] as const;
const IDENTITY_LINKED_PROVIDERS = ["google", "facebook"] as const;

export const entitlementSourceEnum = pgEnum("entitlement_source", ENTITLEMENT_SOURCES);

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
export const preferredFootEnum = pgEnum("preferred_foot", PREFERRED_FOOT);
export const honourSubjectTypeEnum = pgEnum("honour_subject_type", HONOUR_SUBJECT_TYPES);
export const userRoleEnum = pgEnum("user_role", USER_ROLES);
export const authEventKindEnum = pgEnum("auth_event_kind", AUTH_EVENT_KINDS);
export const identityLinkedProviderEnum = pgEnum(
  "identity_linked_provider",
  IDENTITY_LINKED_PROVIDERS,
);
export const userLocaleEnum = pgEnum("user_locale", USER_LOCALES);
export const appearanceModeEnum = pgEnum("appearance_mode", APPEARANCE_MODES);
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

export const country = pgTable(
  "country",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** ISO 3166-1 alpha-2. United Kingdom is GB, not UK. */
    iso3166: text("iso3166").notNull(),
    /** ISO 3166-1 alpha-3. */
    iso3166Alpha3: text("iso3166_alpha3"),
    /** ISO 3166-1 numeric (UN M49), three digits with leading zeros. */
    iso3166Numeric: text("iso3166_numeric"),
    /** Exceptionally reserved ISO 3166-1 alpha-2 (UK for Great Britain). */
    iso3166Reserved: text("iso3166_reserved"),
    /** FIFA three-letter association code. Null when FIFA has no country-level code (e.g. UK). */
    fifa: text("fifa"),
    /** IOC three-letter code. */
    ioc: text("ioc"),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("country_iso3166_idx").on(table.iso3166),
    uniqueIndex("country_iso3166_alpha3_unique")
      .on(table.iso3166Alpha3)
      .where(sql`${table.iso3166Alpha3} IS NOT NULL`),
    uniqueIndex("country_iso3166_numeric_unique")
      .on(table.iso3166Numeric)
      .where(sql`${table.iso3166Numeric} IS NOT NULL`),
    uniqueIndex("country_fifa_unique").on(table.fifa).where(sql`${table.fifa} IS NOT NULL`),
    uniqueIndex("country_ioc_unique").on(table.ioc).where(sql`${table.ioc} IS NOT NULL`),
  ],
);

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
  foundedOn: date("founded_on"),
  stadiumName: text("stadium_name"),
  stadiumCapacity: integer("stadium_capacity"),
  primaryColorHex: text("primary_color_hex"),
  secondaryColorHex: text("secondary_color_hex"),
  websiteUrl: text("website_url"),
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
  dateOfBirth: date("date_of_birth"),
  heightCm: smallint("height_cm"),
  preferredFoot: preferredFootEnum("preferred_foot"),
  primaryCountryId: uuid("primary_country_id").references(() => country.id),
  placeOfBirth: text("place_of_birth"),
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
    position: text("position"),
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

export const honour = pgTable(
  "honour",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectType: honourSubjectTypeEnum("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    seasonLabel: text("season_label"),
    title: text("title").notNull(),
    source: labelSourceEnum("source").notNull().default("seed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("honour_subject_season_title_unique").on(
      table.subjectType,
      table.subjectId,
      sql`COALESCE(${table.seasonLabel}, '')`,
      table.title,
    ),
  ],
);

export const playerJerseyNumber = pgTable(
  "player_jersey_number",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => player.id),
    seasonId: uuid("season_id").references(() => season.id),
    seasonLabel: text("season_label"),
    clubId: uuid("club_id").references(() => club.id),
    nationalTeamId: uuid("national_team_id").references(() => nationalTeam.id),
    squadNumber: integer("squad_number"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("player_jersey_number_upsert_unique").on(
      table.playerId,
      sql`COALESCE(${table.seasonLabel}, '')`,
      sql`COALESCE(${table.clubId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`COALESCE(${table.nationalTeamId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`COALESCE(${table.squadNumber}, -1)`,
    ),
  ],
);

export const playerPhoto = pgTable("player_photo", {
  id: uuid("id").primaryKey().defaultRandom(),
  playerId: uuid("player_id")
    .notNull()
    .references(() => player.id),
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
    name: text("name").notNull().default(""),
    handle: text("handle").notNull(),
    aboutMe: text("about_me"),
    avatarObjectKey: text("avatar_object_key"),
    image: text("image"),
    fullName: text("full_name"),
    phone: text("phone"),
    birthday: date("birthday"),
    emailVerified: boolean("email_verified").notNull().default(false),
    countryId: uuid("country_id").references(() => country.id),
    city: text("city"),
    showCity: boolean("show_city").notNull().default(false),
    locale: userLocaleEnum("locale").notNull().default("da"),
    appearance: appearanceModeEnum("appearance").notNull().default("system"),
    pushEnabled: boolean("push_enabled").notNull().default(false),
    pushHighPriority: boolean("push_high_priority").notNull().default(true),
    pushOther: boolean("push_other").notNull().default(true),
    emailNews: boolean("email_news").notNull().default(false),
    emailHighPriority: boolean("email_high_priority").notNull().default(true),
    privacyPersonalised: boolean("privacy_personalised").notNull().default(true),
    privacyRecentlySeen: boolean("privacy_recently_seen").notNull().default(true),
    privacyFavoriteNotifications: boolean("privacy_favorite_notifications").notNull().default(true),
    cookieAnalysis: boolean("cookie_analysis").notNull().default(false),
    cookieMarketing: boolean("cookie_marketing").notNull().default(false),
    role: userRoleEnum("role").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_email_unique").on(table.email),
    uniqueIndex("user_handle_unique").on(table.handle),
  ],
);

export const identityProvider = pgTable(
  "identity_provider",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    provider: identityLinkedProviderEnum("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("identity_provider_user_provider_unique").on(table.userId, table.provider),
    uniqueIndex("identity_provider_provider_user_unique").on(table.provider, table.providerUserId),
  ],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("session_token_unique").on(table.token)],
);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authEvent = pgTable("auth_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => user.id, { onDelete: "cascade" }),
  kind: authEventKindEnum("kind").notNull(),
  provider: identityLinkedProviderEnum("provider"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authThrottleHit = pgTable(
  "auth_throttle_hit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bucket: text("bucket").notNull(),
    bucketKey: text("bucket_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("auth_throttle_hit_bucket_key_created_idx").on(
      table.bucket,
      table.bucketKey,
      table.createdAt,
    ),
  ],
);

export const authSecurityDetection = pgTable(
  "auth_security_detection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sentinelId: text("sentinel_id").notNull(),
    kind: text("kind").notNull(),
    userId: uuid("user_id").references(() => user.id, { onDelete: "set null" }),
    summary: text("summary").notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("auth_security_detection_sentinel_id_unique").on(table.sentinelId)],
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
  private: boolean("private").notNull().default(false),
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

export const moderationBlock = pgTable(
  "moderation_block",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => user.id),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("moderation_block_pair_unique").on(table.blockerId, table.blockedId)],
);

export const moderationReport = pgTable("moderation_report", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporterId: uuid("reporter_id")
    .notNull()
    .references(() => user.id),
  peerId: uuid("peer_id")
    .notNull()
    .references(() => user.id),
  conversationId: uuid("conversation_id").references(() => conversation.id),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
  imageObjectKey: text("image_object_key"),
  replyToMessageId: uuid("reply_to_message_id").references(
    (): AnyPgColumn => conversationMessage.id,
  ),
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

export const userJerseyFavorite = pgTable(
  "user_jersey_favorite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    collectorId: uuid("collector_id")
      .notNull()
      .references(() => user.id),
    userJerseyId: uuid("user_jersey_id")
      .notNull()
      .references(() => userJersey.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_jersey_favorite_collector_jersey_unique").on(
      table.collectorId,
      table.userJerseyId,
    ),
  ],
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

export const wishlistEntry = pgTable("wishlist_entry", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id),
  clubId: uuid("club_id").references(() => club.id),
  seasonId: uuid("season_id").references(() => season.id),
  type: kitTypeEnum("type"),
  size: jerseySizeEnum("size"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const entitlement = pgTable(
  "entitlement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    source: entitlementSourceEnum("source"),
    expires: timestamp("expires", { withTimezone: true }),
    trialUsed: boolean("trial_used").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("entitlement_user_id_unique").on(table.userId)],
);

export const offer = pgTable("offer", {
  id: uuid("id").primaryKey().defaultRandom(),
  monthProductId: text("month_product_id").notNull(),
  yearProductId: text("year_product_id").notNull(),
  trialEnabled: boolean("trial_enabled").notNull().default(false),
  trialDays: integer("trial_days").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const countryRelations = relations(country, ({ many }) => ({
  leagues: many(league),
  clubs: many(club),
  nationalTeams: many(nationalTeam),
  players: many(player),
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
  playerClubSeasons: many(playerClubSeason),
  jerseyNumbers: many(playerJerseyNumber),
}));

export const seasonRelations = relations(season, ({ one, many }) => ({
  league: one(league, { fields: [season.leagueId], references: [league.id] }),
  teamSeasons: many(teamSeason),
  kits: many(kit),
  playerClubSeasons: many(playerClubSeason),
  jerseyNumbers: many(playerJerseyNumber),
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

export const playerRelations = relations(player, ({ one, many }) => ({
  primaryCountry: one(country, {
    fields: [player.primaryCountryId],
    references: [country.id],
  }),
  clubSeasons: many(playerClubSeason),
  jerseyNumbers: many(playerJerseyNumber),
  photos: many(playerPhoto),
}));

export const playerClubSeasonRelations = relations(playerClubSeason, ({ one }) => ({
  player: one(player, { fields: [playerClubSeason.playerId], references: [player.id] }),
  club: one(club, { fields: [playerClubSeason.clubId], references: [club.id] }),
  season: one(season, { fields: [playerClubSeason.seasonId], references: [season.id] }),
}));

export const playerJerseyNumberRelations = relations(playerJerseyNumber, ({ one }) => ({
  player: one(player, { fields: [playerJerseyNumber.playerId], references: [player.id] }),
  season: one(season, { fields: [playerJerseyNumber.seasonId], references: [season.id] }),
  club: one(club, { fields: [playerJerseyNumber.clubId], references: [club.id] }),
  nationalTeam: one(nationalTeam, {
    fields: [playerJerseyNumber.nationalTeamId],
    references: [nationalTeam.id],
  }),
}));

export const playerPhotoRelations = relations(playerPhoto, ({ one }) => ({
  player: one(player, { fields: [playerPhoto.playerId], references: [player.id] }),
}));

export const userRelations = relations(user, ({ many }) => ({
  jerseys: many(userJersey),
  shortcuts: many(collectionShortcut),
  wishlistEntries: many(wishlistEntry),
  jerseyFavorites: many(userJerseyFavorite),
  sessions: many(session),
  accounts: many(account),
  authEvents: many(authEvent),
  authSecurityDetections: many(authSecurityDetection),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const authEventRelations = relations(authEvent, ({ one }) => ({
  user: one(user, { fields: [authEvent.userId], references: [user.id] }),
}));

export const authSecurityDetectionRelations = relations(authSecurityDetection, ({ one }) => ({
  user: one(user, { fields: [authSecurityDetection.userId], references: [user.id] }),
}));

export const userJerseyFavoriteRelations = relations(userJerseyFavorite, ({ one }) => ({
  collector: one(user, {
    fields: [userJerseyFavorite.collectorId],
    references: [user.id],
  }),
  userJersey: one(userJersey, {
    fields: [userJerseyFavorite.userJerseyId],
    references: [userJersey.id],
  }),
}));

export const collectionShortcutRelations = relations(collectionShortcut, ({ one }) => ({
  user: one(user, { fields: [collectionShortcut.userId], references: [user.id] }),
  country: one(country, { fields: [collectionShortcut.countryId], references: [country.id] }),
  league: one(league, { fields: [collectionShortcut.leagueId], references: [league.id] }),
  club: one(club, { fields: [collectionShortcut.clubId], references: [club.id] }),
  player: one(player, { fields: [collectionShortcut.playerId], references: [player.id] }),
}));

export const wishlistEntryRelations = relations(wishlistEntry, ({ one }) => ({
  user: one(user, { fields: [wishlistEntry.userId], references: [user.id] }),
  club: one(club, { fields: [wishlistEntry.clubId], references: [club.id] }),
  season: one(season, { fields: [wishlistEntry.seasonId], references: [season.id] }),
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
