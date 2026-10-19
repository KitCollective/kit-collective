import { JERSEY_SIZES, KIT_TYPES } from "@kit/domain";
import { z } from "zod";

const MESSAGE_KINDS = ["text", "image", "bid", "system"] as const;
const BID_STATUSES = ["pending", "accepted", "declined"] as const;
/**
 * Why a system line was written. `bid_accepted`: the Bud in this Conversation was accepted.
 * `jersey_gone`: the Bud in this Conversation was declined because the owner accepted another Bud on the jersey.
 */
const SYSTEM_REASONS = ["bid_accepted", "jersey_gone"] as const;

export const collectionConversationReplyToSchema = z
  .object({
    id: z.string().uuid(),
    text: z.string().min(1),
  })
  .strict();

export type CollectionConversationReplyTo = z.infer<typeof collectionConversationReplyToSchema>;

/**
 * The UserJersey a message is about. The labels are as they were when the message was sent.
 * `userJerseyId` and `thumbUrl` are null once the UserJersey is deleted or made private; the labels stay readable.
 * `thumbUrl` is the jersey's first showcase photo; `openForBid` is its live åben for bud (false when gone).
 */
const collectionConversationMessageJerseySchema = z
  .object({
    userJerseyId: z.string().uuid().nullable(),
    thumbUrl: z.string().min(1).nullable(),
    openForBid: z.boolean(),
    clubLabel: z.string().min(1),
    seasonLabel: z.string().min(1),
    type: z.enum(KIT_TYPES),
    size: z.enum(JERSEY_SIZES),
  })
  .strict();

export const collectionConversationMessageSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(MESSAGE_KINDS),
    role: z.enum(["incoming", "outgoing"]),
    text: z.string().optional(),
    imageUrl: z.string().min(1).optional(),
    bidAmountDkk: z.number().int().min(1).optional(),
    bidStatus: z.enum(BID_STATUSES).optional(),
    /**
     * Set only on `kind: "system"`. A system line also carries the Bud's `jersey` and a `bidAmountDkk`:
     * the accepted amount on `bid_accepted`, the declined Bud's own amount on `jersey_gone`.
     */
    systemReason: z.enum(SYSTEM_REASONS).optional(),
    createdAt: z.string().datetime(),
    replyTo: collectionConversationReplyToSchema.optional(),
    jersey: collectionConversationMessageJerseySchema.optional(),
  })
  .strict();

export type CollectionConversationMessage = z.infer<typeof collectionConversationMessageSchema>;

export const collectionConversationDetailSchema = z
  .object({
    id: z.string().uuid(),
    peerHandle: z.string().min(1),
    messages: z.array(collectionConversationMessageSchema),
  })
  .strict();

export type CollectionConversationDetail = z.infer<typeof collectionConversationDetailSchema>;

export const collectionSendMessageRequestSchema = z
  .object({
    text: z.string().min(1).optional(),
    contentBase64: z.string().min(1).optional(),
    replyToMessageId: z.string().uuid().optional(),
    /** The UserJersey of the peer this message is about. It must be public; the message keeps a snapshot of it. */
    userJerseyId: z.string().uuid().optional(),
  })
  .strict()
  .refine((value) => Boolean(value.text?.trim()) || Boolean(value.contentBase64), {
    message: "At least one of text or contentBase64 is required",
  });

export type CollectionSendMessageRequest = z.infer<typeof collectionSendMessageRequestSchema>;

export const collectionSendMessageResponseSchema = z
  .object({
    conversationId: z.string().uuid(),
    messageId: z.string().uuid(),
  })
  .strict();

export type CollectionSendMessageResponse = z.infer<typeof collectionSendMessageResponseSchema>;
