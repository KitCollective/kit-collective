import { z } from "zod";

/** Digits in the e-mail sign-in code. */
export const IDENTITY_CODE_LENGTH = 6;

export const identityCodeRequestSchema = z
  .object({
    email: z.string().email(),
  })
  .strict();

export type IdentityCodeRequest = z.infer<typeof identityCodeRequestSchema>;

/** The same body for a new and for an existing e-mail: the door never says who is a member. */
export const identityCodeAcceptedSchema = z
  .object({
    accepted: z.literal(true),
  })
  .strict();

export type IdentityCodeAccepted = z.infer<typeof identityCodeAcceptedSchema>;

export const identityCodeVerifySchema = z
  .object({
    email: z.string().email(),
    code: z.string().regex(new RegExp(`^\\d{${IDENTITY_CODE_LENGTH}}$`)),
  })
  .strict();

export type IdentityCodeVerify = z.infer<typeof identityCodeVerifySchema>;
