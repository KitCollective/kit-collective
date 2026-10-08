import { KIT_TYPES } from "@kit/domain";
import { z } from "zod";
import { collectionJerseyPhotoSchema } from "./save.js";

/** Coarse upper bound for unsigned first-session showcase reads. */
export const COLLECTION_SHOWCASE_JERSEY_CAP = 40;

export const collectionShowcaseJerseySchema = z
  .object({
    id: z.string().uuid(),
    clubLabel: z.string().min(1),
    seasonLabel: z.string().min(1),
    type: z.enum(KIT_TYPES),
    photos: z.array(collectionJerseyPhotoSchema).min(1),
  })
  .strict();

export type CollectionShowcaseJersey = z.infer<typeof collectionShowcaseJerseySchema>;

export const collectionShowcaseJerseysSchema = z
  .object({
    jerseys: z.array(collectionShowcaseJerseySchema),
  })
  .strict();

export type CollectionShowcaseJerseys = z.infer<typeof collectionShowcaseJerseysSchema>;
