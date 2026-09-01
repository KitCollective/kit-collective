import { AUTH_EVENT_KINDS } from "@kit/domain";
import { z } from "zod";
import { identityLinkedProviderSchema } from "./account.js";

export const authEventKindSchema = z.enum(AUTH_EVENT_KINDS);

export type AuthEventKind = z.infer<typeof authEventKindSchema>;

export const authEventSchema = z
  .object({
    id: z.string().uuid(),
    kind: authEventKindSchema,
    provider: identityLinkedProviderSchema.nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();

export type AuthEvent = z.infer<typeof authEventSchema>;

export const authEventsSchema = z
  .object({
    events: z.array(authEventSchema),
  })
  .strict();

export type AuthEvents = z.infer<typeof authEventsSchema>;
