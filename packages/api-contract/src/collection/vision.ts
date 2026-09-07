import { KIT_TYPES, PHOTO_ROLES } from "@kit/domain";
import { z } from "zod";
import {
  VISION_JOB_KINDS,
  type VisionJobKind,
  visionGroupingSuggestionsSchema,
} from "./vision-grouping.js";

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
    photos: z.array(visionSuggestPhotoSchema).min(1),
  })
  .strict();

export const visionFieldPreselectSchema = z
  .object({
    club: z.boolean().optional(),
    season: z.boolean().optional(),
    type: z.boolean().optional(),
    player: z.boolean().optional(),
    badge: z.boolean().optional(),
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
    playerId: z.string().uuid().optional(),
    playerLabel: z.string().min(1).optional(),
    playerNumber: z.string().min(1).optional(),
    patchId: z.string().uuid().optional(),
    patchLabel: z.string().min(1).optional(),
  })
  .strict();

export const visionJobResponseSchema = z
  .object({
    jobId: z.string().uuid(),
    status: z.enum(VISION_JOB_STATUSES),
    kind: z.enum(VISION_JOB_KINDS).optional(),
    /** When true (≥70% overall), legacy clients may pre-select all suggested fields. */
    preselect: z.boolean().optional(),
    /** Per-field preselect: ≥70% + catalog hit for that field. */
    fieldPreselect: visionFieldPreselectSchema.optional(),
    /** True when the model hinted a club but the catalog mapper found no club row. */
    catalogMiss: z.boolean().optional(),
    suggestions: visionSuggestionsSchema.optional(),
    grouping: visionGroupingSuggestionsSchema.optional(),
  })
  .strict();

export { VISION_JOB_KINDS, type VisionJobKind };

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
export type VisionFieldPreselect = z.infer<typeof visionFieldPreselectSchema>;
export type VisionSuggestRequest = z.infer<typeof visionSuggestRequestSchema>;
export type VisionSuggestResponse = z.infer<typeof visionSuggestResponseSchema>;
export type VisionSuggestions = z.infer<typeof visionSuggestionsSchema>;
export type VisionJobResponse = z.infer<typeof visionJobResponseSchema>;
export type VisionLogRequest = z.infer<typeof visionLogRequestSchema>;
export type VisionLogResponse = z.infer<typeof visionLogResponseSchema>;
