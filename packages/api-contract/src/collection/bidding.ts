import { KIT_TYPES } from "@kit/domain";
import { z } from "zod";
import { collectionJerseyPhotoSchema } from "./save.js";

export const collectionBiddingPatchSchema = z
  .object({
    biddingEnabled: z.boolean(),
  })
  .strict();

export type CollectionBiddingPatch = z.infer<typeof collectionBiddingPatchSchema>;

export const collectionPrivatePatchSchema = z
  .object({
    private: z.boolean(),
  })
  .strict();

export type CollectionPrivatePatch = z.infer<typeof collectionPrivatePatchSchema>;

export const collectionDiscoverJerseySchema = z
  .object({
    id: z.string().uuid(),
    clubId: z.string().uuid(),
    seasonId: z.string().uuid(),
    type: z.enum(KIT_TYPES),
    clubLabel: z.string().min(1),
    seasonLabel: z.string().min(1),
    ownerHandle: z.string().min(1),
    photos: z.array(collectionJerseyPhotoSchema).min(1),
  })
  .strict();

export type CollectionDiscoverJersey = z.infer<typeof collectionDiscoverJerseySchema>;

export const collectionDiscoverJerseysSchema = z
  .object({
    jerseys: z.array(collectionDiscoverJerseySchema),
  })
  .strict();

export type CollectionDiscoverJerseys = z.infer<typeof collectionDiscoverJerseysSchema>;

export const collectionPeerJerseySchema = z
  .object({
    id: z.string().uuid(),
    clubId: z.string().uuid(),
    seasonId: z.string().uuid(),
    type: z.enum(KIT_TYPES),
    clubLabel: z.string().min(1),
    seasonLabel: z.string().min(1),
    ownerHandle: z.string().min(1),
    ownerId: z.string().uuid(),
    ownerInitial: z.string().min(1),
    biddingEnabled: z.boolean(),
    latestBidAmountDkk: z.number().int().min(1).nullable(),
    photos: z.array(collectionJerseyPhotoSchema).min(1),
  })
  .strict();

export type CollectionPeerJersey = z.infer<typeof collectionPeerJerseySchema>;

export const collectionSendBidRequestSchema = z
  .object({
    amountDkk: z.number().int().min(1),
  })
  .strict();

export type CollectionSendBidRequest = z.infer<typeof collectionSendBidRequestSchema>;

export const collectionSendBidResponseSchema = z
  .object({
    conversationId: z.string().uuid(),
    messageId: z.string().uuid(),
  })
  .strict();

export type CollectionSendBidResponse = z.infer<typeof collectionSendBidResponseSchema>;
