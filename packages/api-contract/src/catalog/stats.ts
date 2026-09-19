import { z } from "zod";

/** Integer counts per stamdata table — no KitPhoto bytes or URLs. */
export const catalogStatsSchema = z
  .object({
    countries: z.number().int().nonnegative(),
    leagues: z.number().int().nonnegative(),
    clubs: z.number().int().nonnegative(),
    nationalTeams: z.number().int().nonnegative(),
    seasons: z.number().int().nonnegative(),
    teamSeasons: z.number().int().nonnegative(),
    players: z.number().int().nonnegative(),
    playerClubSeasons: z.number().int().nonnegative(),
    manufacturers: z.number().int().nonnegative(),
    kits: z.number().int().nonnegative(),
    kitPhotos: z.number().int().nonnegative(),
    catalogLabels: z.number().int().nonnegative(),
    externalIds: z.number().int().nonnegative(),
    users: z.number().int().nonnegative(),
  })
  .strict();

export type CatalogStats = z.infer<typeof catalogStatsSchema>;

export const catalogStatsKeys = catalogStatsSchema.keyof().options;
