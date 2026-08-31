import {
  JERSEY_CONDITIONS,
  JERSEY_SIZES,
  KIT_TYPES,
  PHOTO_ROLES,
  PHOTO_SOURCES,
} from "@kit/domain";
import { z } from "zod";

export const collectionSavePhotoSchema = z
  .object({
    role: z.enum(PHOTO_ROLES),
    source: z.enum(PHOTO_SOURCES),
    contentBase64: z.string().min(1),
  })
  .strict();

export const collectionSaveRequestSchema = z
  .object({
    draftId: z.string().uuid().optional(),
    /** Client-started Vision job — Save must not enqueue a duplicate. */
    visionJobId: z.string().uuid().optional(),
    clubId: z.string().uuid(),
    seasonId: z.string().uuid(),
    catalogKitId: z.string().uuid().nullable().optional(),
    type: z.enum(KIT_TYPES),
    size: z.enum(JERSEY_SIZES),
    condition: z.enum(JERSEY_CONDITIONS),
    photos: z.array(collectionSavePhotoSchema).min(1),
  })
  .strict();

export const collectionJerseyPhotoSchema = z
  .object({
    id: z.string().uuid(),
    role: z.enum(PHOTO_ROLES),
    source: z.enum(PHOTO_SOURCES),
    objectKey: z.string().min(1),
    photoUrl: z.string().min(1),
    ocrStatus: z.literal("none"),
  })
  .strict();

export const collectionJerseySquadPlayerSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().min(1),
  })
  .strict();

export const collectionJerseySchema = z
  .object({
    id: z.string().uuid(),
    clubId: z.string().uuid(),
    seasonId: z.string().uuid(),
    countryId: z.string().uuid(),
    leagueId: z.string().uuid().nullable(),
    catalogKitId: z.string().uuid().nullable(),
    type: z.enum(KIT_TYPES),
    size: z.enum(JERSEY_SIZES),
    condition: z.enum(JERSEY_CONDITIONS),
    countryLabel: z.string().min(1),
    leagueLabel: z.string().min(1).nullable(),
    clubLabel: z.string().min(1),
    seasonLabel: z.string().min(1),
    squadPlayers: z.array(collectionJerseySquadPlayerSchema),
    photos: z.array(collectionJerseyPhotoSchema).min(1),
    biddingEnabled: z.boolean(),
    private: z.boolean(),
  })
  .strict();

export const collectionSaveResponseSchema = z
  .object({
    jersey: collectionJerseySchema,
    /** Vision job id when Save started or reused one — client can reconcile userAction. */
    visionJobId: z.string().uuid().optional(),
  })
  .strict();

export type CollectionSavePhoto = z.infer<typeof collectionSavePhotoSchema>;
export type CollectionSaveRequest = z.infer<typeof collectionSaveRequestSchema>;
export type CollectionJerseyPhoto = z.infer<typeof collectionJerseyPhotoSchema>;
export type CollectionJerseySquadPlayer = z.infer<typeof collectionJerseySquadPlayerSchema>;
export type CollectionJersey = z.infer<typeof collectionJerseySchema>;
export type CollectionSaveResponse = z.infer<typeof collectionSaveResponseSchema>;
