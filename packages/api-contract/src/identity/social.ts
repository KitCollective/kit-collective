import { z } from "zod";
import { identityLinkedProviderSchema } from "./account.js";

export const identitySocialLoginSchema = z
  .object({
    provider: identityLinkedProviderSchema,
    idToken: z.string().min(1),
  })
  .strict();

export type IdentitySocialLogin = z.infer<typeof identitySocialLoginSchema>;
