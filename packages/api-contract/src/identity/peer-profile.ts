import { z } from "zod";
import { handleSchema } from "./profile.js";

export const identityPeerProfileSchema = z
  .object({
    id: z.string().uuid(),
    handle: handleSchema,
    aboutMe: z.string().nullable(),
    avatarUrl: z.string().min(1).nullable(),
    countryLabel: z.string().nullable(),
    city: z.string().nullable(),
    showCity: z.boolean(),
  })
  .strict();

export type IdentityPeerProfile = z.infer<typeof identityPeerProfileSchema>;
