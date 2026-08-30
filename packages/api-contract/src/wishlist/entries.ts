import { JERSEY_SIZES, KIT_TYPES } from "@kit/domain";
import { z } from "zod";

const facetUuid = z.string().uuid();

export const wishlistEntrySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    meta: z.string().min(1),
    clubId: z.string().uuid().nullable(),
    clubLabel: z.string().min(1).nullable(),
    seasonId: z.string().uuid().nullable(),
    seasonLabel: z.string().min(1).nullable(),
    type: z.enum(KIT_TYPES).nullable(),
    typeLabel: z.string().min(1).nullable(),
    size: z.enum(JERSEY_SIZES).nullable(),
    sizeLabel: z.string().min(1).nullable(),
  })
  .strict();

export type WishlistEntry = z.infer<typeof wishlistEntrySchema>;

export const wishlistEntriesSchema = z
  .object({
    entries: z.array(wishlistEntrySchema),
  })
  .strict();

export type WishlistEntries = z.infer<typeof wishlistEntriesSchema>;

const wishlistEntryWriteFields = {
  clubId: facetUuid.optional(),
  seasonId: facetUuid.optional(),
  type: z.enum(KIT_TYPES).optional(),
  size: z.enum(JERSEY_SIZES).optional(),
} as const;

export const wishlistEntryWriteSchema = z
  .object(wishlistEntryWriteFields)
  .strict()
  .superRefine((value, ctx) => {
    const hasCriterion =
      value.clubId !== undefined || value.seasonId !== undefined || value.type !== undefined;

    if (!hasCriterion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one of clubId, seasonId, or type is required",
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
