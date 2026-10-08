import { z } from "zod";
import { authEventSchema } from "../identity/auth-events.js";

export const adminAuthEventsSchema = z
  .object({
    events: z.array(authEventSchema),
  })
  .strict();

export type AdminAuthEvents = z.infer<typeof adminAuthEventsSchema>;

export const authSecurityDetectionSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.string().min(1),
    userId: z.string().uuid().nullable(),
    summary: z.string().min(1),
    detectedAt: z.string().datetime(),
  })
  .strict();

export type AuthSecurityDetection = z.infer<typeof authSecurityDetectionSchema>;

export const authSecurityDetectionsSchema = z
  .object({
    detections: z.array(authSecurityDetectionSchema),
  })
  .strict();

export type AuthSecurityDetections = z.infer<typeof authSecurityDetectionsSchema>;
