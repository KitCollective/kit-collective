import { z } from "zod";

const emailSwitchesSchema = z
  .object({
    bidsAndMessages: z.boolean(),
    wishMatches: z.boolean(),
    news: z.boolean(),
  })
  .strict();

const pushSwitchesSchema = z
  .object({
    bids: z.boolean(),
    messages: z.boolean(),
    wishMatches: z.boolean(),
  })
  .strict();

export const notificationPrefsSchema = z
  .object({
    email: emailSwitchesSchema,
    push: pushSwitchesSchema,
  })
  .strict();

export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

/** Any switch in any group; an empty body or an empty group changes nothing and is refused. */
export const notificationPrefsUpdateSchema = z
  .object({
    email: emailSwitchesSchema
      .partial()
      .refine((group) => Object.keys(group).length > 0)
      .optional(),
    push: pushSwitchesSchema
      .partial()
      .refine((group) => Object.keys(group).length > 0)
      .optional(),
  })
  .strict()
  .refine((update) => update.email !== undefined || update.push !== undefined);

export type NotificationPrefsUpdate = z.infer<typeof notificationPrefsUpdateSchema>;

/** What a Collector with no stored record has. */
export const NOTIFICATION_PREFS_DEFAULTS: NotificationPrefs = {
  email: { bidsAndMessages: true, wishMatches: true, news: false },
  push: { bids: true, messages: true, wishMatches: true },
};
