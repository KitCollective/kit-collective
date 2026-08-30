import { z } from "zod";

export const offerSchema = z
  .object({
    monthProductId: z.string().min(1),
    yearProductId: z.string().min(1),
    trialEnabled: z.boolean(),
    trialDays: z.number().int().nonnegative(),
  })
  .strict();

export type Offer = z.infer<typeof offerSchema>;

export const offerPatchRequestSchema = offerSchema;

export type OfferPatchRequest = z.infer<typeof offerPatchRequestSchema>;
