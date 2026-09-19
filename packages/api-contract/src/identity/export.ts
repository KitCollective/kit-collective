import { z } from "zod";
import { handleSchema } from "./profile.js";

export const identityExportSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    handle: handleSchema,
    aboutMe: z.string().nullable(),
    fullName: z.string().nullable(),
    phone: z.string().nullable(),
    birthday: z.string().date().nullable(),
    userJerseyIds: z.array(z.string().uuid()),
  })
  .strict();

export type IdentityExport = z.infer<typeof identityExportSchema>;
