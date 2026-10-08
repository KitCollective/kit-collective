import {
  VISION_IMPROVE_ENTITY_TYPES,
  VISION_IMPROVE_FIELDS,
  VISION_IMPROVE_KINDS,
  VISION_IMPROVE_STATUSES,
} from "@kit/domain";
import { z } from "zod";
import { adminVisionLabelIdentitySchema } from "./vision-labels.js";

export type {
  VisionImproveEntityType,
  VisionImproveField,
  VisionImproveKind,
  VisionImproveStatus,
} from "@kit/domain";
export {
  VISION_IMPROVE_ENTITY_TYPES,
  VISION_IMPROVE_FIELDS,
  VISION_IMPROVE_KINDS,
  VISION_IMPROVE_STATUSES,
};

export const visionImproveKindSchema = z.enum(VISION_IMPROVE_KINDS);
export const visionImproveStatusSchema = z.enum(VISION_IMPROVE_STATUSES);
export const visionImproveEntityTypeSchema = z.enum(VISION_IMPROVE_ENTITY_TYPES);
export const visionImproveFieldSchema = z.enum(VISION_IMPROVE_FIELDS);

export const adminVisionImproveRowSchema = z
  .object({
    id: z.string().uuid(),
    kind: visionImproveKindSchema,
    status: visionImproveStatusSchema,
    count: z.number().int().nonnegative(),
    fingerprint: z.string().min(1),
    text: z.string().min(1).optional(),
    entityType: visionImproveEntityTypeSchema.optional(),
    entityId: z.string().uuid().optional(),
    field: visionImproveFieldSchema.optional(),
    createdAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().optional(),
    suggested: adminVisionLabelIdentitySchema,
    selected: adminVisionLabelIdentitySchema,
    lastSeenAt: z.string().datetime(),
  })
  .strict();

export type AdminVisionImproveRow = z.infer<typeof adminVisionImproveRowSchema>;

export const adminVisionImproveListSchema = z
  .object({
    total: z.number().int().nonnegative(),
    rows: z.array(adminVisionImproveRowSchema),
  })
  .strict();

export type AdminVisionImproveList = z.infer<typeof adminVisionImproveListSchema>;
export type AdminVisionImproves = AdminVisionImproveList;
export const adminVisionImprovesSchema = adminVisionImproveListSchema;

export const adminVisionImproveQuerySchema = z
  .object({
    status: visionImproveStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict();

export type AdminVisionImproveQuery = z.infer<typeof adminVisionImproveQuerySchema>;

export const adminVisionImproveIdParamSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

export type AdminVisionImproveIdParam = z.infer<typeof adminVisionImproveIdParamSchema>;

export const adminVisionImproveApplyResponseSchema = adminVisionImproveRowSchema;
export type AdminVisionImproveApplyResponse = AdminVisionImproveRow;

export const adminVisionImproveDismissResponseSchema = adminVisionImproveRowSchema;
export type AdminVisionImproveDismissResponse = AdminVisionImproveRow;
