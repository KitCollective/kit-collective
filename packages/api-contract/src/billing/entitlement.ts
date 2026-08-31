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

export const iapPlatformSchema = z.enum(["apple", "google"]);

export type IapPlatform = z.infer<typeof iapPlatformSchema>;

export const iapVerifyRequestSchema = z
  .object({
    platform: iapPlatformSchema,
    productId: z.string().min(1),
    token: z.string().min(1),
  })
  .strict();

export type IapVerifyRequest = z.infer<typeof iapVerifyRequestSchema>;

export const iapRestoreRequestSchema = z
  .object({
    platform: iapPlatformSchema,
    token: z.string().min(1),
  })
  .strict();

export type IapRestoreRequest = z.infer<typeof iapRestoreRequestSchema>;

export const billingIapResponseSchema = entitlementSchema;

export type BillingIapResponse = z.infer<typeof billingIapResponseSchema>;
