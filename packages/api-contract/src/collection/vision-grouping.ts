import { z } from "zod";

export const VISION_JOB_KINDS = ["identity", "grouping"] as const;
export type VisionJobKind = (typeof VISION_JOB_KINDS)[number];

export const visionGroupingPhotoSchema = z
  .object({
    photoId: z.string().uuid(),
    contentBase64: z.string().min(1),
  })
  .strict();

export const visionGroupingSuggestRequestSchema = z
  .object({
    sessionId: z.string().uuid().optional(),
    photos: z.array(visionGroupingPhotoSchema).min(2),
  })
  .strict();

export const visionGroupingGroupSchema = z
  .object({
    photoIds: z.array(z.string().uuid()).min(1),
    confidence: z.number().min(0).max(100).optional(),
  })
  .strict();

export const visionGroupingSuggestionsSchema = z
  .object({
    groups: z.array(visionGroupingGroupSchema).min(1),
  })
  .strict();

export type VisionGroupingPhoto = z.infer<typeof visionGroupingPhotoSchema>;
export type VisionGroupingSuggestRequest = z.infer<typeof visionGroupingSuggestRequestSchema>;
export type VisionGroupingGroup = z.infer<typeof visionGroupingGroupSchema>;
export type VisionGroupingSuggestions = z.infer<typeof visionGroupingSuggestionsSchema>;
