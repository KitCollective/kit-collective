import { JERSEY_SIZES, KIT_TYPES } from "@kit/domain";
import { z } from "zod";

const facetUuid = z.string().uuid();

/** Most Matches one Wish row carries in the list response; `matchCount` is the total. */
export const WISHLIST_MATCH_CAP = 10;

export const wishlistMatchSchema = z
  .object({
    jerseyId: z.string().uuid(),
    thumbUrl: z.string().min(1).nullable(),
    ownerHandle: z.string().min(1),
    foundAt: z.string().datetime(),
    seen: z.boolean(),
  })
  .strict();

export type WishlistMatch = z.infer<typeof wishlistMatchSchema>;

export const wishlistEntrySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    meta: z.string().min(1),
    clubId: z.string().uuid().nullable(),
    clubLabel: z.string().min(1).nullable(),
    nationalTeamId: z.string().uuid().nullable(),
    nationalTeamLabel: z.string().min(1).nullable(),
    seasonId: z.string().uuid().nullable(),
    seasonLabel: z.string().min(1).nullable(),
    type: z.enum(KIT_TYPES).nullable(),
    typeLabel: z.string().min(1).nullable(),
    size: z.enum(JERSEY_SIZES).nullable(),
    sizeLabel: z.string().min(1).nullable(),
    matches: z.array(wishlistMatchSchema).max(WISHLIST_MATCH_CAP),
    matchCount: z.number().int().nonnegative(),
    unseenCount: z.number().int().nonnegative(),
  })
  .strict();

export type WishlistEntry = z.infer<typeof wishlistEntrySchema>;

export const wishlistEntriesSchema = z
  .object({
    entries: z.array(wishlistEntrySchema),
    unseenCount: z.number().int().nonnegative(),
  })
  .strict();

export type WishlistEntries = z.infer<typeof wishlistEntriesSchema>;

export const wishlistUnseenCountSchema = z
  .object({
    unseenCount: z.number().int().nonnegative(),
  })
  .strict();

export type WishlistUnseenCount = z.infer<typeof wishlistUnseenCountSchema>;

const wishlistEntryWriteFields = {
  clubId: facetUuid.optional(),
  nationalTeamId: facetUuid.optional(),
  seasonId: facetUuid.optional(),
  type: z.enum(KIT_TYPES).optional(),
  size: z.enum(JERSEY_SIZES).optional(),
} as const;

export const wishlistEntryWriteSchema = z
  .object(wishlistEntryWriteFields)
  .strict()
  .superRefine((value, ctx) => {
    if (value.clubId !== undefined && value.nationalTeamId !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "clubId and nationalTeamId are mutually exclusive",
        path: ["nationalTeamId"],
      });
    }

    const hasCriterion =
      value.clubId !== undefined ||
      value.nationalTeamId !== undefined ||
      value.seasonId !== undefined ||
      value.type !== undefined;

    if (!hasCriterion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one of clubId, nationalTeamId, seasonId, or type is required",
      });
    }
  });

export type WishlistEntryWrite = z.infer<typeof wishlistEntryWriteSchema>;

export const wishlistEntryIdParamSchema = z
  .object({
    entryId: z.string().uuid(),
  })
  .strict();

export type WishlistEntryIdParam = z.infer<typeof wishlistEntryIdParamSchema>;
