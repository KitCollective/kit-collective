import { KIT_TYPES, PHOTO_ROLES } from "@kit/domain";
import { z } from "zod";

/** Vision job lifecycle on VisionLog.status. */
export const VISION_JOB_STATUSES = ["pending", "ready", "failed", "noop"] as const;
export type VisionJobStatus = (typeof VISION_JOB_STATUSES)[number];

/** Collector action on a Vision suggestion (VisionLog.userAction). */
export const VISION_USER_ACTIONS = ["accepted", "edited", "ignored"] as const;
export type VisionUserAction = (typeof VISION_USER_ACTIONS)[number];

/** tech-stack.md §6: ≥70% preselect, 50–69% suggest-only, else ignore. */
export const VISION_CONFIDENCE_PRESELECT = 70;
export const VISION_CONFIDENCE_SUGGEST = 50;

/** Coarse per-IP cap for unsigned first-session Vision suggest (in-memory throttle). */
export const UNSIGNED_VISION_SUGGEST_CAP = 20;

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
    /** When true (≥70% confidence), confirm may pre-select fields. When false (50–69%), show only. */
    preselect: z.boolean().optional(),
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
