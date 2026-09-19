import { APPEARANCE_MODES, USER_LOCALES } from "@kit/domain";
import { z } from "zod";

export const identityPrefsSchema = z
  .object({
    pushEnabled: z.boolean(),
    pushHighPriority: z.boolean(),
    pushOther: z.boolean(),
    emailNews: z.boolean(),
    emailHighPriority: z.boolean(),
    privacyPersonalised: z.boolean(),
    privacyRecentlySeen: z.boolean(),
    privacyFavoriteNotifications: z.boolean(),
    locale: z.enum(USER_LOCALES),
    appearance: z.enum(APPEARANCE_MODES),
  })
  .strict();

export type IdentityPrefs = z.infer<typeof identityPrefsSchema>;

export const identityPrefsUpdateSchema = identityPrefsSchema.partial().strict();

export type IdentityPrefsUpdate = z.infer<typeof identityPrefsUpdateSchema>;
