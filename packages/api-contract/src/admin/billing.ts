import { z } from "zod";
import { entitlementSchema } from "../billing/entitlement.js";

export const grantCompRequestSchema = z
  .object({
    expires: z.string().datetime(),
  })
  .strict();

export type GrantCompRequest = z.infer<typeof grantCompRequestSchema>;

export const grantCompResponseSchema = entitlementSchema;

export type GrantCompResponse = z.infer<typeof grantCompResponseSchema>;
