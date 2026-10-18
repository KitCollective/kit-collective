import { z } from "zod";

export const collectionConversationPeerSchema = z
  .object({
    peerId: z.string().uuid(),
    handle: z.string().min(1),
    jerseyCount: z.number().int().min(0),
    city: z.string().min(1).optional(),
    avatarUrl: z.string().min(1).nullable(),
    /**
     * The pair's Conversation. On a peer lookup it is null when none exists yet, or when the viewer hid it
     * (it returns on send).
     */
    conversationId: z.string().uuid().nullable(),
  })
  .strict();

export type CollectionConversationPeer = z.infer<typeof collectionConversationPeerSchema>;

export const collectionReportConversationRequestSchema = z
  .object({
    reason: z.string().max(1000).optional(),
  })
  .strict();

export type CollectionReportConversationRequest = z.infer<
  typeof collectionReportConversationRequestSchema
>;

export const collectionReportConversationResponseSchema = z
  .object({
    reportId: z.string().uuid(),
  })
  .strict();

export type CollectionReportConversationResponse = z.infer<
  typeof collectionReportConversationResponseSchema
>;

export const collectionBlockConversationResponseSchema = z
  .object({
    blockId: z.string().uuid(),
  })
  .strict();

export type CollectionBlockConversationResponse = z.infer<
  typeof collectionBlockConversationResponseSchema
>;

export const collectionReportPeerRequestSchema = collectionReportConversationRequestSchema;

export type CollectionReportPeerRequest = z.infer<typeof collectionReportPeerRequestSchema>;

export const collectionReportPeerResponseSchema = collectionReportConversationResponseSchema;

export type CollectionReportPeerResponse = z.infer<typeof collectionReportPeerResponseSchema>;

export const collectionBlockPeerResponseSchema = collectionBlockConversationResponseSchema;

export type CollectionBlockPeerResponse = z.infer<typeof collectionBlockPeerResponseSchema>;
