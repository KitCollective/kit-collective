import { z } from "zod";

export const entitlementSourceSchema = z.enum(["iap_apple", "iap_google", "trial", "comp"]);

export type EntitlementSource = z.infer<typeof entitlementSourceSchema>;

export const entitlementSchema = z
  .object({
    live: z.boolean(),
    source: entitlementSourceSchema.nullable(),
    expires: z.string().datetime().nullable(),
    trialUsed: z.boolean(),
  })
  .strict();

export type Entitlement = z.infer<typeof entitlementSchema>;

export const billingStartTrialResponseSchema = entitlementSchema;

export type BillingStartTrialResponse = z.infer<typeof billingStartTrialResponseSchema>;
