import { z } from "zod";

const facetUuid = z.string().uuid();

/** One collection genvej owned by the signed-in collector. */
export const collectionShortcutSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    sortOrder: z.number().int(),
    countryId: z.string().uuid().nullable(),
    countryLabel: z.string().min(1).nullable(),
    leagueId: z.string().uuid().nullable(),
    leagueLabel: z.string().min(1).nullable(),
    clubId: z.string().uuid().nullable(),
    clubLabel: z.string().min(1).nullable(),
    playerId: z.string().uuid().nullable(),
    playerLabel: z.string().min(1).nullable(),
    matchCount: z.number().int().nonnegative(),
  })
  .strict();

export type CollectionShortcut = z.infer<typeof collectionShortcutSchema>;

export const collectionShortcutsSchema = z
  .object({
    shortcuts: z.array(collectionShortcutSchema),
  })
  .strict();

export type CollectionShortcuts = z.infer<typeof collectionShortcutsSchema>;

const collectionShortcutFacetFields = {
  name: z.string().trim().min(1).optional(),
  countryId: facetUuid.optional(),
  leagueId: facetUuid.optional(),
  clubId: facetUuid.optional(),
  playerId: facetUuid.optional(),
  sortOrder: z.number().int().optional(),
} as const;

export const collectionShortcutWriteSchema = z
  .object(collectionShortcutFacetFields)
  .strict()
  .superRefine((value, ctx) => {
    const hasFacet =
      value.countryId !== undefined ||
      value.leagueId !== undefined ||
      value.clubId !== undefined ||
      value.playerId !== undefined;

    if (!hasFacet) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one facet (countryId, leagueId, clubId, or playerId) is required",
      });
    }
  });

export type CollectionShortcutWrite = z.infer<typeof collectionShortcutWriteSchema>;

export const collectionShortcutReorderSchema = z
  .object({
    orderedIds: z.array(z.string().uuid()).min(1),
  })
  .strict();

export type CollectionShortcutReorder = z.infer<typeof collectionShortcutReorderSchema>;

export const collectionShortcutIdParamSchema = z
  .object({
    shortcutId: z.string().uuid(),
  })
  .strict();

export type CollectionShortcutIdParam = z.infer<typeof collectionShortcutIdParamSchema>;

export const collectionJerseysQuerySchema = z
  .object({
    shortcutId: z.string().uuid().optional(),
  })
  .strict();

export type CollectionJerseysQuery = z.infer<typeof collectionJerseysQuerySchema>;
