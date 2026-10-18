import { z } from "zod";

/** Accepter / Afvis on an incoming Bud. */
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
