import { z } from "zod";

export const identityRoleSchema = z.enum(["user", "admin"]);

export type IdentityRole = z.infer<typeof identityRoleSchema>;

export const identityUserSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    role: identityRoleSchema,
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

export const identitySessionSchema = z
  .object({
    accessToken: z.string().min(1),
    user: identityUserSchema,
  })
  .strict();

export type IdentitySession = z.infer<typeof identitySessionSchema>;

export const identityMeSchema = identityUserSchema;

export type IdentityMe = z.infer<typeof identityMeSchema>;
