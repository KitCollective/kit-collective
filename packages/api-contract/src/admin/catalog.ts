import { CLUB_KINDS, KIT_TYPES } from "@kit/domain";
import { z } from "zod";

export const adminStamdataEntityTypeSchema = z.enum([
  "country",
  "league",
  "club",
  "season",
  "club_season",
  "kit",
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
    kitType: z.enum(KIT_TYPES).optional(),
    hasPhoto: z.boolean().optional(),
    photoPath: z.string().optional(),
    squadCount: z.number().int().nonnegative().optional(),
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

export const adminStamdataQuerySchema = z
  .object({
    q: z.string().trim().optional(),
    countryId: z.string().uuid().optional(),
    leagueId: z.string().uuid().optional(),
    seasonId: z.string().uuid().optional(),
    kitType: z.enum(KIT_TYPES).optional(),
    hasPhoto: z.enum(["true", "false"]).optional(),
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

export const adminKitDrillSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().min(1),
    kitType: z.enum(KIT_TYPES),
    clubLabel: z.string().optional(),
    seasonLabel: z.string().min(1),
    hasPhoto: z.boolean(),
    photoPath: z.string().optional(),
  })
  .strict();

export type AdminKitDrill = z.infer<typeof adminKitDrillSchema>;

export const adminSquadPlayerSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().min(1),
    squadNumber: z.number().int().nullable(),
  })
  .strict();

export type AdminSquadPlayer = z.infer<typeof adminSquadPlayerSchema>;

export const adminClubSeasonKitSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().min(1),
    kitType: z.enum(KIT_TYPES),
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

export const adminKitIdParamSchema = z
  .object({
    kitId: z.string().uuid(),
  })
  .strict();

export type AdminKitIdParam = z.infer<typeof adminKitIdParamSchema>;

export const adminClubSeasonOptionSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().min(1),
  })
  .strict();

export type AdminClubSeasonOption = z.infer<typeof adminClubSeasonOptionSchema>;

export const adminClubDrillSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().min(1),
    countryLabel: z.string().optional(),
    monogram: z.string().min(1).max(3),
    kind: z.enum(CLUB_KINDS),
    validFrom: z.string().nullable(),
    validTo: z.string().nullable(),
    successorLabel: z.string().min(1).optional(),
    seasons: z.array(adminClubSeasonOptionSchema),
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

/** Entity types the admin stamdata list API can emit as clickable rows. */
export const ADMIN_STAMDATA_LIST_ENTITY_TYPES = [
  "club",
  "season",
  "club_season",
  "kit",
] as const satisfies readonly AdminStamdataEntityType[];
