import { JERSEY_CONDITIONS, JERSEY_SIZES, KIT_TYPES, PHOTO_ROLES } from "@kit/domain";
import { z } from "zod";
import { entitlementSchema } from "../billing/entitlement.js";
import { identityRoleSchema } from "../identity/session.js";

export const adminCollectorQuerySchema = z
  .object({
    q: z.string().trim().optional(),
  })
  .strict();

export type AdminCollectorQuery = z.infer<typeof adminCollectorQuerySchema>;

export const adminCollectorRowSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    role: identityRoleSchema,
    jerseyCount: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    monogram: z.string().min(1).max(3),
  })
  .strict();

export type AdminCollectorRow = z.infer<typeof adminCollectorRowSchema>;

export const adminCollectorListSchema = z
  .object({
    total: z.number().int().nonnegative(),
    rows: z.array(adminCollectorRowSchema),
  })
  .strict();

export type AdminCollectorList = z.infer<typeof adminCollectorListSchema>;

export const adminCollectorUserIdParamSchema = z
  .object({
    userId: z.string().uuid(),
  })
  .strict();

export type AdminCollectorUserIdParam = z.infer<typeof adminCollectorUserIdParamSchema>;

export const adminCollectorUserSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    role: identityRoleSchema,
    jerseyCount: z.number().int().nonnegative(),
    adminCount: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    monogram: z.string().min(1).max(3),
    entitlement: entitlementSchema,
  })
  .strict();

export type AdminCollectorUser = z.infer<typeof adminCollectorUserSchema>;

export const adminCollectorJerseyRowSchema = z
  .object({
    id: z.string().uuid(),
    clubLabel: z.string().min(1),
    seasonLabel: z.string().min(1),
    type: z.enum(KIT_TYPES),
    photoPath: z.string().optional(),
  })
  .strict();

export type AdminCollectorJerseyRow = z.infer<typeof adminCollectorJerseyRowSchema>;

export const adminCollectorJerseyListSchema = z
  .object({
    total: z.number().int().nonnegative(),
    rows: z.array(adminCollectorJerseyRowSchema),
  })
  .strict();

export type AdminCollectorJerseyList = z.infer<typeof adminCollectorJerseyListSchema>;

export const adminCollectorJerseyIndexRowSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    userEmail: z.string().email(),
    clubLabel: z.string().min(1),
    seasonLabel: z.string().min(1),
    type: z.enum(KIT_TYPES),
    photoPath: z.string().optional(),
  })
  .strict();

export type AdminCollectorJerseyIndexRow = z.infer<typeof adminCollectorJerseyIndexRowSchema>;

export const adminCollectorJerseyIndexSchema = z
  .object({
    total: z.number().int().nonnegative(),
    rows: z.array(adminCollectorJerseyIndexRowSchema),
  })
  .strict();

export type AdminCollectorJerseyIndex = z.infer<typeof adminCollectorJerseyIndexSchema>;

export const adminCollectorJerseyParamsSchema = z
  .object({
    userId: z.string().uuid(),
    jerseyId: z.string().uuid(),
  })
  .strict();

export type AdminCollectorJerseyParams = z.infer<typeof adminCollectorJerseyParamsSchema>;

export const adminCollectorJerseyPhotoSchema = z
  .object({
    id: z.string().uuid(),
    role: z.enum(PHOTO_ROLES),
    photoPath: z.string().min(1),
  })
  .strict();

export type AdminCollectorJerseyPhoto = z.infer<typeof adminCollectorJerseyPhotoSchema>;

export const adminCollectorJerseyDrillSchema = z
  .object({
    id: z.string().uuid(),
    clubLabel: z.string().min(1),
    seasonLabel: z.string().min(1),
    type: z.enum(KIT_TYPES),
    size: z.enum(JERSEY_SIZES),
    condition: z.enum(JERSEY_CONDITIONS),
    photos: z.array(adminCollectorJerseyPhotoSchema),
  })
  .strict();

export type AdminCollectorJerseyDrill = z.infer<typeof adminCollectorJerseyDrillSchema>;

export const adminCollectorPhotoParamsSchema = z
  .object({
    userId: z.string().uuid(),
    jerseyId: z.string().uuid(),
    photoId: z.string().uuid(),
  })
  .strict();

export type AdminCollectorPhotoParams = z.infer<typeof adminCollectorPhotoParamsSchema>;
