import {
  HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH,
  HANDLE_PATTERN,
  HANDLE_STATUSES,
} from "@kit/domain";
import { z } from "zod";

export const handleSchema = z
  .string()
  .min(HANDLE_MIN_LENGTH)
  .max(HANDLE_MAX_LENGTH)
  .regex(HANDLE_PATTERN);

export type Handle = z.infer<typeof handleSchema>;

export const handleAvailabilityStatusSchema = z.enum(HANDLE_STATUSES);

export type HandleAvailabilityStatus = z.infer<typeof handleAvailabilityStatusSchema>;

export const handleAvailabilityQuerySchema = z
  .object({
    handle: handleSchema,
  })
  .strict();

export type HandleAvailabilityQuery = z.infer<typeof handleAvailabilityQuerySchema>;

export const handleAvailabilityResponseSchema = z
  .object({
    handle: handleSchema,
    status: handleAvailabilityStatusSchema,
  })
  .strict();

export type HandleAvailabilityResponse = z.infer<typeof handleAvailabilityResponseSchema>;

export const identityProfileUpdateSchema = z
  .object({
    handle: handleSchema.optional(),
    aboutMe: z.string().max(500).nullable().optional(),
  })
  .strict()
  .refine((value) => value.handle !== undefined || value.aboutMe !== undefined, {
    message: "At least one field is required",
  });

export type IdentityProfileUpdate = z.infer<typeof identityProfileUpdateSchema>;

export const identityAvatarUploadSchema = z
  .object({
    contentBase64: z.string().min(1),
  })
  .strict();

export type IdentityAvatarUpload = z.infer<typeof identityAvatarUploadSchema>;
