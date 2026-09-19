import { z } from "zod";

const BID_STATUSES = ["pending", "accepted", "declined"] as const;

/** One bid event in Aktivitet — projection of a bid message, not a separate table. */
export const collectionActivityItemSchema = z
  .object({
    id: z.string().uuid(),
    conversationId: z.string().uuid(),
    title: z.string().min(1),
    kitLine: z.string().min(1),
    amountDkk: z.number().int().min(1),
    status: z.enum(BID_STATUSES),
    fromHandle: z.string().min(1),
    unread: z.boolean(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type CollectionActivityItem = z.infer<typeof collectionActivityItemSchema>;

export const collectionActivitySchema = z
  .object({
    items: z.array(collectionActivityItemSchema),
  })
  .strict();

export type CollectionActivity = z.infer<typeof collectionActivitySchema>;

export const collectionRespondBidRequestSchema = z
  .object({
    decision: z.enum(["accept", "decline"]),
  })
  .strict();

export type CollectionRespondBidRequest = z.infer<typeof collectionRespondBidRequestSchema>;

export const collectionRespondBidResponseSchema = z
  .object({
    bidStatus: z.enum(["accepted", "declined"]),
  })
  .strict();

export type CollectionRespondBidResponse = z.infer<typeof collectionRespondBidResponseSchema>;
