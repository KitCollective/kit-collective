import { KIT_TYPES, PHOTO_ROLES, VISION_JOB_STATUSES, VISION_USER_ACTIONS } from "@kit/domain";
import { z } from "zod";

export const visionSuggestPhotoSchema = z
  .object({
    role: z.enum(PHOTO_ROLES),
    contentBase64: z.string().min(1),
  })
  .strict();

export const visionSuggestRequestSchema = z
  .object({
    draftId: z.string().uuid().optional(),
    photo: visionSuggestPhotoSchema,
  })
  .strict();

export const visionSuggestResponseSchema = z
  .object({
    jobId: z.string().uuid(),
  })
  .strict();

export const visionSuggestionsSchema = z
  .object({
    clubId: z.string().uuid().optional(),
    seasonId: z.string().uuid().optional(),
    catalogKitId: z.string().uuid().optional(),
    type: z.enum(KIT_TYPES).optional(),
    clubLabel: z.string().min(1).optional(),
    seasonLabel: z.string().min(1).optional(),
  })
  .strict();

export const visionJobResponseSchema = z
  .object({
    jobId: z.string().uuid(),
    status: z.enum(VISION_JOB_STATUSES),
    suggestions: visionSuggestionsSchema.optional(),
  })
  .strict();

export const visionLogRequestSchema = z
  .object({
    jobId: z.string().uuid(),
    action: z.enum(VISION_USER_ACTIONS),
    clubId: z.string().uuid().optional(),
    seasonId: z.string().uuid().optional(),
    catalogKitId: z.string().uuid().nullable().optional(),
    type: z.enum(KIT_TYPES).optional(),
    userJerseyId: z.string().uuid().optional(),
  })
  .strict();

export const visionLogResponseSchema = z
  .object({
    logged: z.literal(true),
  })
  .strict();

export type VisionSuggestPhoto = z.infer<typeof visionSuggestPhotoSchema>;
export type VisionSuggestRequest = z.infer<typeof visionSuggestRequestSchema>;
export type VisionSuggestResponse = z.infer<typeof visionSuggestResponseSchema>;
export type VisionSuggestions = z.infer<typeof visionSuggestionsSchema>;
export type VisionJobResponse = z.infer<typeof visionJobResponseSchema>;
export type VisionLogRequest = z.infer<typeof visionLogRequestSchema>;
export type VisionLogResponse = z.infer<typeof visionLogResponseSchema>;
