import { z } from "zod";

export const identityVerifyRequestSchema = z
  .object({
    token: z.string().min(1),
  })
  .strict();

export type IdentityVerifyRequest = z.infer<typeof identityVerifyRequestSchema>;

export const identityVerifyResponseSchema = z
  .object({
    emailVerified: z.literal(true),
  })
  .strict();

export type IdentityVerifyResponse = z.infer<typeof identityVerifyResponseSchema>;

export const identityPasswordResetRequestSchema = z
  .object({
    email: z.string().email(),
  })
  .strict();

export type IdentityPasswordResetRequest = z.infer<typeof identityPasswordResetRequestSchema>;

export const identityPasswordResetAcceptedSchema = z
  .object({
    accepted: z.literal(true),
  })
  .strict();

export type IdentityPasswordResetAccepted = z.infer<typeof identityPasswordResetAcceptedSchema>;

export const identityPasswordResetCompleteSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(8).max(128),
  })
  .strict();

export type IdentityPasswordResetComplete = z.infer<typeof identityPasswordResetCompleteSchema>;
