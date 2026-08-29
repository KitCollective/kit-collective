import { KIT_TYPES } from "@kit/domain";
import { z } from "zod";

/** One favorite tile in the Favoritter drill — no owner handle on the grid. */
export const collectionFavoriteItemSchema = z
  .object({
    userJerseyId: z.string().uuid(),
    photoUrl: z.string().min(1),
    clubLabel: z.string().min(1),
    seasonLabel: z.string().min(1),
    type: z.enum(KIT_TYPES),
  })
  .strict();

export type CollectionFavoriteItem = z.infer<typeof collectionFavoriteItemSchema>;

/** Signed-in collector's saved favorites of other collectors' UserJerseys. */
export const collectionFavoritesSchema = z
  .object({
    favorites: z.array(collectionFavoriteItemSchema),
  })
  .strict();

export type CollectionFavorites = z.infer<typeof collectionFavoritesSchema>;

export const collectionAddFavoriteRequestSchema = z
  .object({
    userJerseyId: z.string().uuid(),
  })
  .strict();

export type CollectionAddFavoriteRequest = z.infer<typeof collectionAddFavoriteRequestSchema>;
