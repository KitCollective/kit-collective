import { z } from "zod";

export const IDENTITY_LINKED_PROVIDERS = ["google", "facebook"] as const;

export const identityLinkedProviderSchema = z.enum(IDENTITY_LINKED_PROVIDERS);

export type IdentityLinkedProvider = z.infer<typeof identityLinkedProviderSchema>;

export const identityLinkedAccountSchema = z
  .object({
    provider: identityLinkedProviderSchema,
    linked: z.boolean(),
  })
  .strict();

export type IdentityLinkedAccount = z.infer<typeof identityLinkedAccountSchema>;

export const identityAccountFieldsSchema = z
  .object({
    emailVerified: z.boolean(),
    fullName: z.string().nullable(),
    phone: z.string().nullable(),
    birthday: z.string().date().nullable(),
    linkedAccounts: z.array(identityLinkedAccountSchema),
  })
  .strict();

export type IdentityAccountFields = z.infer<typeof identityAccountFieldsSchema>;

export const identityAccountUpdateSchema = z
  .object({
    fullName: z.string().max(200).nullable().optional(),
    phone: z.string().max(32).nullable().optional(),
    birthday: z.string().date().nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.fullName !== undefined || value.phone !== undefined || value.birthday !== undefined,
    { message: "At least one field is required" },
  );

export type IdentityAccountUpdate = z.infer<typeof identityAccountUpdateSchema>;

export const identityPasswordChangeSchema = z
  .object({
    currentPassword: z.string().min(8).max(128),
    newPassword: z.string().min(8).max(128),
  })
  .strict();

export type IdentityPasswordChange = z.infer<typeof identityPasswordChangeSchema>;

export const identityEmailChangeSchema = z
  .object({
    email: z.string().email().max(320),
    password: z.string().min(8).max(128),
  })
  .strict();

export type IdentityEmailChange = z.infer<typeof identityEmailChangeSchema>;
