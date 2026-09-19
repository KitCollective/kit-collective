import { z } from "zod";

export const cookieConsentSchema = z
  .object({
    analysis: z.boolean(),
    marketing: z.boolean(),
  })
  .strict();

export type CookieConsent = z.infer<typeof cookieConsentSchema>;

export const cookieConsentUpdateSchema = cookieConsentSchema.strict();

export type CookieConsentUpdate = z.infer<typeof cookieConsentUpdateSchema>;

/** Essential-only consent: analysis and marketing off. */
export function essentialOnlyCookieConsent(): CookieConsent {
  return { analysis: false, marketing: false };
}

/** Accept-all consent: analysis and marketing on. */
export function acceptAllCookieConsent(): CookieConsent {
  return { analysis: true, marketing: true };
}
