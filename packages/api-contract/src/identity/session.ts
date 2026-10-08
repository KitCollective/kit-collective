import { z } from "zod";
import { entitlementSchema } from "../billing/entitlement.js";
import { identityAccountFieldsSchema } from "./account.js";
import { handleSchema } from "./profile.js";

export const identityRoleSchema = z.enum(["user", "admin"]);

export type IdentityRole = z.infer<typeof identityRoleSchema>;

export const identityUserSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    role: identityRoleSchema,
    handle: handleSchema,
  })
  .strict();

export type IdentityUser = z.infer<typeof identityUserSchema>;

export const identityCredentialsSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8).max(128),
  })
  .strict();

export type IdentityCredentials = z.infer<typeof identityCredentialsSchema>;

export const identityMeSchema = identityUserSchema
  .extend({
    aboutMe: z.string().nullable(),
    avatarUrl: z.string().min(1).nullable(),
    entitlement: entitlementSchema,
  })
  .merge(identityAccountFieldsSchema);

export type IdentityMe = z.infer<typeof identityMeSchema>;

export const identitySessionSchema = z
  .object({
    accessToken: z.string().min(1),
    user: identityMeSchema,
  })
  .strict();

export type IdentitySession = z.infer<typeof identitySessionSchema>;
