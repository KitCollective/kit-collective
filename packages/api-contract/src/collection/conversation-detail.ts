import { KIT_TYPES } from "@kit/domain";
import { z } from "zod";

const MESSAGE_KINDS = ["text", "image", "bid"] as const;
const BID_STATUSES = ["pending", "accepted", "declined"] as const;

export const collectionConversationJerseyContextSchema = z
  .object({
    clubLabel: z.string().min(1),
    seasonLabel: z.string().min(1),
    type: z.enum(KIT_TYPES),
  })
  .strict();

export type CollectionConversationJerseyContext = z.infer<
  typeof collectionConversationJerseyContextSchema
>;

export const collectionConversationReplyToSchema = z
  .object({
    id: z.string().uuid(),
    text: z.string().min(1),
  })
  .strict();

export type CollectionConversationReplyTo = z.infer<typeof collectionConversationReplyToSchema>;

export const collectionConversationMessageSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(MESSAGE_KINDS),
    role: z.enum(["incoming", "outgoing"]),
    text: z.string().optional(),
    imageUrl: z.string().min(1).optional(),
    bidAmountDkk: z.number().int().min(1).optional(),
    bidStatus: z.enum(BID_STATUSES).optional(),
    createdAt: z.string().datetime(),
    replyTo: collectionConversationReplyToSchema.optional(),
  })
  .strict();

export type CollectionConversationMessage = z.infer<typeof collectionConversationMessageSchema>;

export const collectionConversationDetailSchema = z
  .object({
    id: z.string().uuid(),
    peerHandle: z.string().min(1),
    jerseyContext: collectionConversationJerseyContextSchema.optional(),
    messages: z.array(collectionConversationMessageSchema),
  })
  .strict();

export type CollectionConversationDetail = z.infer<typeof collectionConversationDetailSchema>;

export const collectionSendMessageRequestSchema = z
  .object({
    text: z.string().min(1).optional(),
    contentBase64: z.string().min(1).optional(),
    replyToMessageId: z.string().uuid().optional(),
  })
  .strict()
  .refine((value) => Boolean(value.text?.trim()) || Boolean(value.contentBase64), {
    message: "At least one of text or contentBase64 is required",
  });

export type CollectionSendMessageRequest = z.infer<typeof collectionSendMessageRequestSchema>;

export const collectionSendMessageResponseSchema = z
  .object({
    messageId: z.string().uuid(),
  })
  .strict();

export type CollectionSendMessageResponse = z.infer<typeof collectionSendMessageResponseSchema>;
