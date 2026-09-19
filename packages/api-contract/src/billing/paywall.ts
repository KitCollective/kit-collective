import { z } from "zod";

export const BILLING_PAYWALL_ERROR_CODES = ["PREMIUM_REQUIRED"] as const;

export type BillingPaywallErrorCode = (typeof BILLING_PAYWALL_ERROR_CODES)[number];

export const billingPaywallErrorSchema = z
  .object({
    code: z.enum(BILLING_PAYWALL_ERROR_CODES),
    message: z.string().min(1),
  })
  .strict();

export type BillingPaywallError = z.infer<typeof billingPaywallErrorSchema>;
