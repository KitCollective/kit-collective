import { z } from "zod";

const BID_STATUSES = ["pending", "accepted", "declined"] as const;

/**
 * The latest event of a Conversation, as the fields a row renders. The client composes
 * the sentence ("Dit bud på 400 kr · Afventer svar"); `role` is the viewer's side of a Bud.
 */
export const collectionConversationLatestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string() }).strict(),
  z.object({ kind: z.literal("image") }).strict(),
  z
    .object({
      kind: z.literal("bid"),
      amountDkk: z.number().int().min(1),
      status: z.enum(BID_STATUSES),
      role: z.enum(["incoming", "outgoing"]),
    })
    .strict(),
]);

export type CollectionConversationLatest = z.infer<typeof collectionConversationLatestSchema>;

/** One Indbakke row under Samtaler: one per Collector. */
export const collectionConversationSchema = z
  .object({
    id: z.string().uuid(),
    peerHandle: z.string().min(1),
    peerInitial: z.string().min(1),
    /** `/v1/identity/peers/:id/avatar`; null when the peer has no photo. */
    peerAvatarUrl: z.string().min(1).nullable(),
    latest: collectionConversationLatestSchema,
    updatedAt: z.string().datetime(),
    unread: z.boolean(),
  })
  .strict();

export type CollectionConversation = z.infer<typeof collectionConversationSchema>;

/** One incoming pending Bud under Venter på dit svar. */
export const collectionWaitingBidSchema = z
  .object({
    messageId: z.string().uuid(),
    conversationId: z.string().uuid(),
    /** The UserJersey the Bud is about; null once it is deleted. Indbakke's jersey filter reads it. */
    userJerseyId: z.string().uuid().nullable(),
    bidderHandle: z.string().min(1),
    amountDkk: z.number().int().min(1),
    createdAt: z.string().datetime(),
    jersey: z
      .object({
        clubLabel: z.string().min(1),
        seasonLabel: z.string().min(1),
        type: z.string().min(1),
      })
      .strict(),
    /** `/v1/collection/photos/:id` for the 48 × 60 thumb; null when the jersey is gone or has no photo. */
    thumbUrl: z.string().min(1).nullable(),
  })
  .strict();

export type CollectionWaitingBid = z.infer<typeof collectionWaitingBidSchema>;

/** The Indbakke response: both sections of the screen in one request. */
export const collectionConversationsSchema = z
  .object({
    waiting: z.array(collectionWaitingBidSchema),
    conversations: z.array(collectionConversationSchema),
    unreadCount: z.number().int().min(0),
  })
  .strict();

export type CollectionConversations = z.infer<typeof collectionConversationsSchema>;
