import { z } from "zod";

/** Inbox conversation summary for the signed-in collector. */
export const collectionConversationSchema = z
  .object({
    id: z.string().uuid(),
    peerHandle: z.string().min(1),
    peerInitial: z.string().min(1),
    snippet: z.string(),
    updatedAt: z.string().datetime(),
    unread: z.boolean(),
  })
  .strict();

export type CollectionConversation = z.infer<typeof collectionConversationSchema>;

/** Collector inbox list (Beskeder and Aktivitet share this model). */
export const collectionConversationsSchema = z
  .object({
    conversations: z.array(collectionConversationSchema),
    unreadCount: z.number().int().min(0),
  })
  .strict();

export type CollectionConversations = z.infer<typeof collectionConversationsSchema>;
