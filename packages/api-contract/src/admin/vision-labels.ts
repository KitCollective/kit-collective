import { KIT_TYPES, VISION_EVAL_CLASSES } from "@kit/domain";
import { z } from "zod";
import { VISION_USER_ACTIONS } from "../collection/vision.js";
import { VISION_EVAL_FIELD_HIT_KEYS } from "../collection/vision-eval.js";

export const visionEvalClassSchema = z.enum(VISION_EVAL_CLASSES);

export const visionEvalFieldHitsSchema = z
  .object({
    side: z.boolean(),
    season: z.boolean(),
    type: z.boolean(),
    catalogKitId: z.boolean(),
    player: z.boolean(),
    patch: z.boolean(),
  })
  .strict();

export const adminVisionLabelIdentitySchema = z
  .object({
    clubId: z.string().uuid().optional(),
    nationalTeamId: z.string().uuid().optional(),
    seasonId: z.string().uuid().optional(),
    type: z.enum(KIT_TYPES).optional(),
    catalogKitId: z.string().uuid().optional(),
    playerId: z.string().uuid().optional(),
    patchId: z.string().uuid().optional(),
    clubLabel: z.string().min(1).optional(),
    nationalTeamLabel: z.string().min(1).optional(),
    seasonLabel: z.string().min(1).optional(),
    catalogKitLabel: z.string().min(1).optional(),
    playerLabel: z.string().min(1).optional(),
    patchLabel: z.string().min(1).optional(),
  })
  .strict();

export const adminVisionLabelRowSchema = z
  .object({
    jobId: z.string().uuid(),
    createdAt: z.string().datetime(),
    class: visionEvalClassSchema,
    userAction: z.enum(VISION_USER_ACTIONS).nullable(),
    suggested: adminVisionLabelIdentitySchema,
    selected: adminVisionLabelIdentitySchema,
    fieldHits: visionEvalFieldHitsSchema,
    latencyMs: z.number().int().nonnegative().nullable().optional(),
    model: z.string().min(1).nullable().optional(),
    photoKeys: z.array(z.string().min(1)),
  })
  .strict();

export type AdminVisionLabelIdentity = z.infer<typeof adminVisionLabelIdentitySchema>;
export type AdminVisionLabelRow = z.infer<typeof adminVisionLabelRowSchema>;

export const adminVisionLabelListSchema = z
  .object({
    total: z.number().int().nonnegative(),
    acceptedCount: z.number().int().nonnegative(),
    labelledCount: z.number().int().nonnegative(),
    hitRateCaption: z.string().min(1),
    rows: z.array(adminVisionLabelRowSchema),
  })
  .strict();

export type AdminVisionLabelList = z.infer<typeof adminVisionLabelListSchema>;
export type AdminVisionLabels = AdminVisionLabelList;
export const adminVisionLabelsSchema = adminVisionLabelListSchema;

export type AdminVisionLabelFieldHits = z.infer<typeof visionEvalFieldHitsSchema>;

export const adminVisionLabelQuerySchema = z
  .object({
    class: z.enum(VISION_EVAL_CLASSES).optional(),
    userAction: z.enum(VISION_USER_ACTIONS).optional(),
    user_action: z.enum(VISION_USER_ACTIONS).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict();

export type AdminVisionLabelQuery = z.infer<typeof adminVisionLabelQuerySchema>;

export { VISION_EVAL_FIELD_HIT_KEYS };
