import {
  JERSEY_CONDITIONS,
  JERSEY_SIZES,
  KIT_TYPES,
  MAX_USER_JERSEY_PHOTOS,
  PHOTO_ROLES,
  PHOTO_SOURCES,
  validateJerseyPhotos,
} from "@kit/domain";
import { z } from "zod";

export const collectionSavePhotoSchema = z
  .object({
    role: z.enum(PHOTO_ROLES),
    source: z.enum(PHOTO_SOURCES),
    contentBase64: z.string().min(1),
    label: z.string().optional(),
  })
  .strict()
  .superRefine((photo, ctx) => {
    const label = photo.label?.trim();
    if (label && photo.role !== "other") {
      ctx.addIssue({
        code: "custom",
        message: "label is only allowed when role is other",
      });
    }
  });

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
    photos: z.array(collectionSavePhotoSchema).min(1).max(MAX_USER_JERSEY_PHOTOS),
  })
  .strict()
  .superRefine((body, ctx) => {
    const error = validateJerseyPhotos(body.photos);
    if (error === "duplicate_universal_role") {
      ctx.addIssue({
        code: "custom",
        message: "duplicate universal photo role",
        path: ["photos"],
      });
    }
    if (error === "label_on_universal_role") {
      ctx.addIssue({
        code: "custom",
        message: "label is only allowed when role is other",
        path: ["photos"],
      });
    }
  });

export const collectionJerseyPhotoSchema = z
  .object({
    id: z.string().uuid(),
    role: z.enum(PHOTO_ROLES),
    source: z.enum(PHOTO_SOURCES),
    objectKey: z.string().min(1),
    photoUrl: z.string().min(1),
    ocrStatus: z.literal("none"),
    label: z.string().nullable().optional(),
  })
  .strict()
  .superRefine((photo, ctx) => {
    const label = photo.label?.trim();
    if (label && photo.role !== "other") {
      ctx.addIssue({
        code: "custom",
        message: "label is only allowed when role is other",
      });
    }
  });

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
    photos: z.array(collectionJerseyPhotoSchema).min(1).max(MAX_USER_JERSEY_PHOTOS),
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
