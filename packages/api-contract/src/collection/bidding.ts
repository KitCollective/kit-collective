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

export const collectionDiscoverHomeClubSchema = z
  .object({
    clubId: z.string().uuid(),
    clubLabel: z.string().min(1),
  })
  .strict();

export type CollectionDiscoverHomeClub = z.infer<typeof collectionDiscoverHomeClubSchema>;

export const collectionDiscoverHomeCollectorSchema = z
  .object({
    handle: z.string().min(1),
    initial: z.string().min(1),
    avatarUrl: z.string().min(1).nullable(),
  })
  .strict();

export type CollectionDiscoverHomeCollector = z.infer<typeof collectionDiscoverHomeCollectorSchema>;

export const collectionDiscoverHomeSchema = z
  .object({
    clubs: z.array(collectionDiscoverHomeClubSchema).optional(),
    openForBid: z.array(collectionDiscoverJerseySchema).optional(),
    collectors: z.array(collectionDiscoverHomeCollectorSchema).optional(),
    moreJerseys: z.array(collectionDiscoverJerseySchema).optional(),
  })
  .strict();

export type CollectionDiscoverHome = z.infer<typeof collectionDiscoverHomeSchema>;

export const collectionDiscoverCatalogDrillSchema = z
  .object({
    kind: z.enum(["club", "player"]),
    id: z.string().uuid(),
    title: z.string().min(1),
    count: z.number().int().min(0),
    jerseys: z.array(collectionDiscoverJerseySchema),
  })
  .strict();

export type CollectionDiscoverCatalogDrill = z.infer<typeof collectionDiscoverCatalogDrillSchema>;

export const collectionDiscoverTypeaheadKitSchema = z
  .object({
    kitId: z.string().uuid(),
    label: z.string().min(1),
  })
  .strict();

export type CollectionDiscoverTypeaheadKit = z.infer<typeof collectionDiscoverTypeaheadKitSchema>;

export const collectionDiscoverTypeaheadPlayerSchema = z
  .object({
    playerId: z.string().uuid(),
    playerLabel: z.string().min(1),
  })
  .strict();

export type CollectionDiscoverTypeaheadPlayer = z.infer<
  typeof collectionDiscoverTypeaheadPlayerSchema
>;

export const collectionDiscoverTypeaheadSchema = z
  .object({
    clubs: z.array(collectionDiscoverHomeClubSchema).optional(),
    kits: z.array(collectionDiscoverTypeaheadKitSchema).optional(),
    players: z.array(collectionDiscoverTypeaheadPlayerSchema).optional(),
    collectors: z.array(collectionDiscoverHomeCollectorSchema).optional(),
    jerseys: z.array(collectionDiscoverJerseySchema).optional(),
  })
  .strict();

export type CollectionDiscoverTypeahead = z.infer<typeof collectionDiscoverTypeaheadSchema>;

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
