import { JERSEY_CONDITIONS, JERSEY_SIZES, KIT_TYPES } from "@kit/domain";
import { z } from "zod";
import { collectionJerseySchema } from "./save.js";

export const collectionJerseyUpdateSchema = z
  .object({
    clubId: z.string().uuid(),
    seasonId: z.string().uuid(),
    catalogKitId: z.string().uuid().nullable().optional(),
    type: z.enum(KIT_TYPES),
    size: z.enum(JERSEY_SIZES),
    condition: z.enum(JERSEY_CONDITIONS),
  })
  .strict();

export const collectionJerseyUpdateResponseSchema = z
  .object({
    jersey: collectionJerseySchema,
  })
  .strict();

export type CollectionJerseyUpdate = z.infer<typeof collectionJerseyUpdateSchema>;
export type CollectionJerseyUpdateResponse = z.infer<typeof collectionJerseyUpdateResponseSchema>;
