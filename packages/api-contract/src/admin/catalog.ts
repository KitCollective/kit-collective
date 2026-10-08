import { CLUB_KINDS, KIT_TYPES } from "@kit/domain";
import { z } from "zod";

export const adminStamdataEntityTypeSchema = z.enum([
  "country",
  "league",
  "club",
  "season",
  "club_season",
  "kit",
  "player",
]);

export type AdminStamdataEntityType = z.infer<typeof adminStamdataEntityTypeSchema>;

export const adminStamdataRowSchema = z
  .object({
    entityType: adminStamdataEntityTypeSchema,
    id: z.string().uuid(),
    label: z.string().min(1),
    monogram: z.string().min(1).max(3).optional(),
    clubId: z.string().uuid().optional(),
    seasonId: z.string().uuid().optional(),
    clubLabel: z.string().optional(),
    seasonLabel: z.string().optional(),
    countryLabel: z.string().optional(),
    leagueLabel: z.string().optional(),
    dateOfBirth: z.string().nullable().optional(),
    kitType: z.enum(KIT_TYPES).optional(),
    hasPhoto: z.boolean().optional(),
    photoPath: z.string().optional(),
    squadCount: z.number().int().nonnegative().optional(),
    markPath: z.string().optional(),
  })
  .strict();

export type AdminStamdataRow = z.infer<typeof adminStamdataRowSchema>;

export const adminStamdataListSchema = z
  .object({
    total: z.number().int().nonnegative(),
    rows: z.array(adminStamdataRowSchema),
  })
  .strict();

export type AdminStamdataList = z.infer<typeof adminStamdataListSchema>;

const uuidListSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parts = Array.isArray(value)
    ? value.flatMap((entry) => String(entry).split(","))
    : String(value).split(",");
  const ids = parts.map((part) => part.trim()).filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}, z.array(z.string().uuid()).max(50).optional());

export const adminStamdataQuerySchema = z
  .object({
    q: z.string().trim().optional(),
    entityType: z.enum(["club", "league", "player"]).optional(),
    countryIds: uuidListSchema,
    leagueIds: uuidListSchema,
    seasonId: z.string().uuid().optional(),
    kitType: z.enum(KIT_TYPES).optional(),
    hasPhoto: z.enum(["true", "false"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict();

export type AdminStamdataQuery = z.infer<typeof adminStamdataQuerySchema>;

export const adminFilterOptionSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().min(1),
  })
  .strict();

export type AdminFilterOption = z.infer<typeof adminFilterOptionSchema>;

export const adminFilterOptionsSchema = z
  .object({
    countries: z.array(adminFilterOptionSchema),
    leagues: z.array(adminFilterOptionSchema),
    seasons: z.array(adminFilterOptionSchema),
    kitTypes: z.array(z.enum(KIT_TYPES)),
  })
  .strict();

export type AdminFilterOptions = z.infer<typeof adminFilterOptionsSchema>;

export const adminCompetitionLinkSchema = z
  .object({
    label: z.string().min(1),
    href: z.string().optional(),
  })
  .strict();

export type AdminCompetitionLink = z.infer<typeof adminCompetitionLinkSchema>;

export const adminKitVariantRefSchema = z
  .object({
    id: z.string().uuid(),
    variant: z.string().min(1),
    label: z.string().min(1),
    competition: z.string().optional(),
    competitionHref: z.string().optional(),
    competitions: z.array(adminCompetitionLinkSchema).optional(),
    hasPhoto: z.boolean(),
    photoPath: z.string().optional(),
  })
  .strict();

export type AdminKitVariantRef = z.infer<typeof adminKitVariantRefSchema>;

export const adminKitDrillSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().min(1),
    kitType: z.enum(KIT_TYPES),
    variant: z.string().min(1).optional(),
    clubId: z.string().uuid().optional(),
    clubLabel: z.string().optional(),
    clubMonogram: z.string().min(1).max(3).optional(),
    clubMarkPath: z.string().optional(),
    seasonLabel: z.string().min(1),
    brandLabel: z.string().optional(),
    sponsorName: z.string().optional(),
    design: z.string().optional(),
    colorNames: z.string().optional(),
    primaryColorHex: z.string().optional(),
    secondaryColorHex: z.string().optional(),
    competition: z.string().optional(),
    competitionHref: z.string().optional(),
    competitions: z.array(adminCompetitionLinkSchema).optional(),
    releasedOn: z.string().optional(),
    description: z.string().optional(),
    hasPhoto: z.boolean(),
    photoPath: z.string().optional(),
    photos: z.array(
      z
        .object({
          id: z.string().uuid(),
          path: z.string().min(1),
        })
        .strict(),
    ),
    parentKit: z
      .object({
        id: z.string().uuid(),
        label: z.string().min(1),
      })
      .strict()
      .optional(),
    variants: z.array(adminKitVariantRefSchema),
  })
  .strict();

export type AdminKitDrill = z.infer<typeof adminKitDrillSchema>;

export const adminSquadPlayerSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().min(1),
    squadNumber: z.number().int().nullable(),
    position: z.string().nullable(),
  })
  .strict();

export type AdminSquadPlayer = z.infer<typeof adminSquadPlayerSchema>;

export const adminClubSeasonKitSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().min(1),
    kitType: z.enum(KIT_TYPES),
    variant: z.string().min(1).optional(),
    variantCount: z.number().int().nonnegative(),
    hasPhoto: z.boolean(),
    photoPath: z.string().optional(),
  })
  .strict();

export type AdminClubSeasonKit = z.infer<typeof adminClubSeasonKitSchema>;

export const adminClubSeasonDrillSchema = z
  .object({
    clubId: z.string().uuid(),
    seasonId: z.string().uuid(),
    clubLabel: z.string().min(1),
    seasonLabel: z.string().min(1),
    squadCount: z.number().int().nonnegative(),
    squad: z.array(adminSquadPlayerSchema).optional(),
    kits: z.array(adminClubSeasonKitSchema),
  })
  .strict();

export type AdminClubSeasonDrill = z.infer<typeof adminClubSeasonDrillSchema>;

export const adminClubSeasonParamsSchema = z
  .object({
    clubId: z.string().uuid(),
    seasonId: z.string().uuid(),
  })
  .strict();

export type AdminClubSeasonParams = z.infer<typeof adminClubSeasonParamsSchema>;

export const adminClubSeasonKitsFetchSchema = z
  .object({
    kitsUpserted: z.number().int().nonnegative(),
    photosWritten: z.number().int().nonnegative(),
  })
  .strict();

export type AdminClubSeasonKitsFetch = z.infer<typeof adminClubSeasonKitsFetchSchema>;

export const adminKitIdParamSchema = z
  .object({
    kitId: z.string().uuid(),
  })
  .strict();

export type AdminKitIdParam = z.infer<typeof adminKitIdParamSchema>;

export const adminKitPhotoParamsSchema = z
  .object({
    kitId: z.string().uuid(),
    photoId: z.string().uuid(),
  })
  .strict();

export type AdminKitPhotoParams = z.infer<typeof adminKitPhotoParamsSchema>;

export const adminClubSeasonOptionSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().min(1),
  })
  .strict();

export type AdminClubSeasonOption = z.infer<typeof adminClubSeasonOptionSchema>;

export const adminHonourRowSchema = z
  .object({
    id: z.string().uuid(),
    seasonLabel: z.string().nullable(),
    title: z.string().min(1),
    markPath: z.string().optional(),
  })
  .strict();

export type AdminHonourRow = z.infer<typeof adminHonourRowSchema>;

export const adminClubDrillSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().min(1),
    countryLabel: z.string().optional(),
    monogram: z.string().min(1).max(3),
    markPath: z.string().optional(),
    kind: z.enum(CLUB_KINDS),
    currentLeagueLabel: z.string().min(1).optional(),
    foundedOn: z.string().nullable(),
    stadiumName: z.string().nullable(),
    stadiumCapacity: z.number().int().nullable(),
    websiteUrl: z.string().nullable(),
    validFrom: z.string().nullable(),
    validTo: z.string().nullable(),
    successorLabel: z.string().min(1).optional(),
    seasons: z.array(adminClubSeasonOptionSchema),
    honours: z.array(adminHonourRowSchema),
  })
  .strict();

export type AdminClubDrill = z.infer<typeof adminClubDrillSchema>;

export const adminSeasonDrillSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().min(1),
    leagueLabel: z.string().optional(),
    monogram: z.string().min(1).max(3),
  })
  .strict();

export type AdminSeasonDrill = z.infer<typeof adminSeasonDrillSchema>;

export const adminClubIdParamSchema = z
  .object({
    clubId: z.string().uuid(),
  })
  .strict();

export type AdminClubIdParam = z.infer<typeof adminClubIdParamSchema>;

export const adminSeasonIdParamSchema = z
  .object({
    seasonId: z.string().uuid(),
  })
  .strict();

export type AdminSeasonIdParam = z.infer<typeof adminSeasonIdParamSchema>;

export const adminLeagueIdParamSchema = z
  .object({
    leagueId: z.string().uuid(),
  })
  .strict();

export type AdminLeagueIdParam = z.infer<typeof adminLeagueIdParamSchema>;

export const adminPlayerIdParamSchema = z
  .object({
    playerId: z.string().uuid(),
  })
  .strict();

export type AdminPlayerIdParam = z.infer<typeof adminPlayerIdParamSchema>;

export const adminHonourIdParamSchema = z
  .object({
    honourId: z.string().uuid(),
  })
  .strict();

export type AdminHonourIdParam = z.infer<typeof adminHonourIdParamSchema>;

export const adminLeagueSeasonOptionSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().min(1),
  })
  .strict();

export type AdminLeagueSeasonOption = z.infer<typeof adminLeagueSeasonOptionSchema>;

export const adminLeagueDrillSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().min(1),
    countryLabel: z.string().optional(),
    monogram: z.string().min(1).max(3),
    markPath: z.string().optional(),
    seasons: z.array(adminLeagueSeasonOptionSchema),
  })
  .strict();

export type AdminLeagueDrill = z.infer<typeof adminLeagueDrillSchema>;

export const adminPlayerClubSeasonSchema = z
  .object({
    clubLabel: z.string().min(1),
    seasonLabel: z.string().min(1),
    squadNumber: z.number().int().nullable(),
  })
  .strict();

export type AdminPlayerClubSeason = z.infer<typeof adminPlayerClubSeasonSchema>;

export const adminPlayerDrillSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().min(1),
    monogram: z.string().min(1).max(3),
    markPath: z.string().optional(),
    dateOfBirth: z.string().nullable(),
    countryLabel: z.string().optional(),
    clubSeasons: z.array(adminPlayerClubSeasonSchema),
  })
  .strict();

export type AdminPlayerDrill = z.infer<typeof adminPlayerDrillSchema>;

/** Entity types the Master Data list API can emit as clickable rows. */
export const ADMIN_STAMDATA_LIST_ENTITY_TYPES = [
  "club",
  "league",
  "player",
] as const satisfies readonly AdminStamdataEntityType[];
