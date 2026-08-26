import { z } from "zod";
import { identityRoleSchema } from "./session.js";

export const IDENTITY_ROLE_ERROR_CODES = ["SELF_DEMOTE", "LAST_ADMIN_DEMOTE"] as const;

export type IdentityRoleErrorCode = (typeof IDENTITY_ROLE_ERROR_CODES)[number];

export const identityRoleErrorSchema = z
  .object({
    code: z.enum(IDENTITY_ROLE_ERROR_CODES),
    message: z.string().min(1),
  })
  .strict();

export type IdentityRoleError = z.infer<typeof identityRoleErrorSchema>;

export const adminRoleUpdateRequestSchema = z
  .object({
    role: identityRoleSchema,
  })
  .strict();

export type AdminRoleUpdateRequest = z.infer<typeof adminRoleUpdateRequestSchema>;
