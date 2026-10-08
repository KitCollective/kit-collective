import { JERSEY_CONDITIONS, JERSEY_SIZES, KIT_TYPES } from "@kit/domain";
import { z } from "zod";
import { catalogSideXorIssue } from "../catalog/side.js";
import { collectionJerseySchema } from "./save.js";

export const collectionJerseyUpdateSchema = z
  .object({
    clubId: z.string().uuid().optional(),
    nationalTeamId: z.string().uuid().optional(),
    seasonId: z.string().uuid(),
    catalogKitId: z.string().uuid().nullable().optional(),
    type: z.enum(KIT_TYPES),
    size: z.enum(JERSEY_SIZES),
    condition: z.enum(JERSEY_CONDITIONS),
    playerId: z.string().uuid().nullable().optional(),
    patchIds: z.array(z.string().uuid()).max(1).optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    catalogSideXorIssue(ctx, body.clubId, body.nationalTeamId, true);
  });

export const collectionJerseyUpdateResponseSchema = z
  .object({
    jersey: collectionJerseySchema,
  })
  .strict();

export type CollectionJerseyUpdate = z.infer<typeof collectionJerseyUpdateSchema>;
export type CollectionJerseyUpdateResponse = z.infer<typeof collectionJerseyUpdateResponseSchema>;
