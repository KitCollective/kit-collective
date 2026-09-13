import type { CollectionPhotoVariantQuery } from "@kit/api-contract";
import {
  COLLECTION_SHOWCASE_JERSEY_CAP,
  type CollectionActivity,
  type CollectionConversationDetail,
  type CollectionConversationPeer,
  type CollectionConversations,
  type CollectionDiscoverCatalogDrill,
  type CollectionDiscoverHome,
  type CollectionDiscoverHomeClub,
  type CollectionDiscoverHomeCollector,
  type CollectionDiscoverHomeNationalTeam,
  type CollectionDiscoverJerseys,
  type CollectionDiscoverTypeahead,
  type CollectionDiscoverTypeaheadKit,
  type CollectionDiscoverTypeaheadPlayer,
  type CollectionFavorites,
  type CollectionJersey,
  type CollectionJerseys,
  type CollectionPeerJersey,
  type CollectionPeerJerseys,
  type CollectionRespondBidResponse,
  type CollectionSavePhoto,
  type CollectionSaveResponse,
  type CollectionSendBidResponse,
  type CollectionSendMessageResponse,
  type CollectionShowcaseJerseys,
  collectionActivitySchema,
  collectionAddFavoriteRequestSchema,
  collectionBiddingPatchSchema,
  collectionConversationDetailSchema,
  collectionConversationPeerSchema,
  collectionConversationsSchema,
  collectionDiscoverCatalogDrillSchema,
  collectionDiscoverHomeSchema,
  collectionDiscoverJerseysSchema,
  collectionDiscoverTypeaheadSchema,
  collectionFavoritesSchema,
  collectionJerseysSchema,
  collectionJerseyUpdateSchema,
  collectionPeerJerseySchema,
  collectionPeerJerseysSchema,
  collectionPhotoOriginalUploadSchema,
  collectionPrivatePatchSchema,
  collectionRespondBidRequestSchema,
  collectionRespondBidResponseSchema,
  collectionSaveRequestSchema,
  collectionSaveResponseSchema,
  collectionSendBidRequestSchema,
  collectionSendBidResponseSchema,
  collectionSendMessageRequestSchema,
  collectionSendMessageResponseSchema,
  collectionShowcaseJerseysSchema,
} from "@kit/api-contract";
import type { Db } from "@kit/db";
import {
  catalogLabel,
  club,
  conversation,
  conversationMessage,
  conversationParticipant,
  jerseyDraft,
  kit,
  nationalTeam,
  patch,
  player,
  playerClubSeason,
  playerNationalTeamSeason,
  season,
  user,
  userJersey,
  userJerseyFavorite,
  userJerseyPatch,
  userJerseyPhoto,
  visionLog,
} from "@kit/db";
import type { LabelLocale } from "@kit/domain";
import {
  KIT_TYPE_LABELS_DA,
  maxOriginalPhotoBytesForRole,
  maxSavePhotoBytesForRole,
  photoObjectKeysForDeletion,
  photoPrefixFromStoredObjectKey,
  validateJerseyPhotos,
} from "@kit/domain";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, count, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { DB } from "../db/db.module.js";
import { MatchQueueService } from "../match/match-queue.service.js";
import { ModerationService } from "../moderation/moderation.service.js";
import { VisionService } from "../vision/vision.service.js";
import { VisionQueueService } from "../vision/vision-queue.service.js";
import {
  assertSeasonLinkedToSide,
  discoverJerseySideFromLabels,
  resolveCatalogJerseySide,
  uniqueNonNullIds,
} from "./catalog-side.js";
import { CollectionShortcutsService } from "./collection-shortcuts.service.js";
import { createMemoryObjectStore, type ObjectStoreAdapter } from "./object-store.js";
import { PhotoDerivativeQueueService } from "./photo-derivative-queue.service.js";
import { derivativeKeysForPhoto, storeGpsStrippedOriginal } from "./photo-derivatives.js";
import { gridObjectKeyForNewPhoto, resolveStoredPhotoBytes } from "./photo-variant-resolve.js";
import { createR2ObjectStore } from "./r2-object-store.js";

export const OBJECT_STORE = Symbol("OBJECT_STORE");

function canonicalCollectorPair(leftId: string, rightId: string): [string, string] {
  return leftId < rightId ? [leftId, rightId] : [rightId, leftId];
}

function typeaheadTextMatches(parts: Array<string | undefined>, query: string): boolean {
  const lowered = query.toLowerCase();
  return parts.some((part) => part?.toLowerCase().includes(lowered));
}

function handleInitial(handle: string): string {
  const trimmed = handle.trim();
  if (!trimmed) {
    return "?";
  }
  return trimmed.charAt(0).toUpperCase();
}

function bidSnippet(amountDkk: number): string {
  return `Bud på ${amountDkk} kr`;
}

function activityTitle(
  viewerIsOwner: boolean,
  status: "pending" | "accepted" | "declined",
): string {
  if (viewerIsOwner) {
    switch (status) {
      case "pending":
        return "Nyt bud på din trøje";
      case "accepted":
        return "Bud accepteret";
      case "declined":
        return "Bud afvist";
      default: {
        const _exhaustive: never = status;
        return _exhaustive;
      }
    }
  }

  switch (status) {
    case "pending":
      return "Dit bud afventer";
    case "accepted":
      return "Dit bud blev accepteret";
    case "declined":
      return "Dit bud blev afvist";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function hasR2Config(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_BUCKET &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY,
  );
}

function decodeBase64Photo(contentBase64: string, maxBytes?: number): Uint8Array {
  const commaIndex = contentBase64.indexOf(",");
  const normalized = commaIndex >= 0 ? contentBase64.slice(commaIndex + 1) : contentBase64;
  const bytes = Buffer.from(normalized, "base64");
  if (bytes.length === 0) {
    throw new BadRequestException("Photo bytes are empty");
  }
  if (maxBytes !== undefined && bytes.length > maxBytes) {
    throw new BadRequestException("Photo exceeds the maximum upload size");
  }
  return Uint8Array.from(bytes);
}

@Injectable()
export class CollectionService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(OBJECT_STORE) private readonly objectStore: ObjectStoreAdapter,
    private readonly visionQueueService: VisionQueueService,
    private readonly visionService: VisionService,
    private readonly matchQueueService: MatchQueueService,
    private readonly shortcutsService: CollectionShortcutsService,
    private readonly moderationService: ModerationService,
    private readonly photoDerivativeQueueService: PhotoDerivativeQueueService,
  ) {}

  static objectStoreFactory(): ObjectStoreAdapter {
    if (hasR2Config()) {
      return createR2ObjectStore();
    }
    return createMemoryObjectStore();
  }

  async listJerseys(
    userId: string,
    locale: LabelLocale = "da",
    shortcutId?: string,
  ): Promise<CollectionJerseys> {
    let filterConditions = [eq(userJersey.userId, userId)];

    if (shortcutId) {
      const facets = await this.shortcutsService.getShortcutFacetsForFilter(userId, shortcutId);
      filterConditions = this.shortcutsService.buildJerseyFilterConditions(userId, facets);
    }

    const rows = await this.db
      .select({
        id: userJersey.id,
        clubId: userJersey.clubId,
        nationalTeamId: userJersey.nationalTeamId,
        seasonId: userJersey.seasonId,
        countryId: sql<string>`coalesce(${club.countryId}, ${nationalTeam.countryId})`,
        leagueId: season.leagueId,
        catalogKitId: userJersey.catalogKitId,
        playerId: userJersey.playerId,
        type: userJersey.type,
        size: userJersey.size,
        condition: userJersey.condition,
        seasonLabel: season.label,
        biddingEnabled: userJersey.biddingEnabled,
        private: userJersey.private,
      })
      .from(userJersey)
      .innerJoin(season, eq(userJersey.seasonId, season.id))
      .leftJoin(club, eq(userJersey.clubId, club.id))
      .leftJoin(nationalTeam, eq(userJersey.nationalTeamId, nationalTeam.id))
      .where(and(...filterConditions))
      .orderBy(desc(userJersey.createdAt));

    if (rows.length === 0) {
      return collectionJerseysSchema.parse({ jerseys: [] });
    }

    const clubIds = uniqueNonNullIds(rows.map((row) => row.clubId));
    const nationalTeamIds = uniqueNonNullIds(rows.map((row) => row.nationalTeamId));
    const countryIds = [...new Set(rows.map((row) => row.countryId))];
    const leagueIds = [
      ...new Set(
        rows.map((row) => row.leagueId).filter((leagueId): leagueId is string => leagueId !== null),
      ),
    ];
    const jerseyIds = rows.map((row) => row.id);
    const squadScopes = rows.map((row) =>
      row.clubId
        ? { kind: "club" as const, clubId: row.clubId, seasonId: row.seasonId }
        : {
            kind: "national_team" as const,
            nationalTeamId: row.nationalTeamId!,
            seasonId: row.seasonId,
          },
    );

    const [
      clubLabels,
      nationalTeamLabels,
      countryLabels,
      leagueLabels,
      photosByJersey,
      squadPlayersByScope,
      playerFieldsByJersey,
      patchesByJersey,
    ] = await Promise.all([
      this.resolveEntityLabels("club", clubIds, locale),
      this.resolveEntityLabels("national_team", nationalTeamIds, locale),
      this.resolveEntityLabels("country", countryIds, locale),
      this.resolveEntityLabels("league", leagueIds, locale),
      this.loadPhotosForJerseys(jerseyIds),
      this.loadSquadPlayersForScopes(squadScopes, locale),
      this.loadPlayerFieldsForJerseys(rows, locale),
      this.loadPatchesForJerseys(jerseyIds, locale),
    ]);

    const jerseys: CollectionJersey[] = rows.map((row) => {
      const clubLabel = row.clubId ? (clubLabels.get(row.clubId) ?? null) : null;
      const nationalTeamLabel = row.nationalTeamId
        ? (nationalTeamLabels.get(row.nationalTeamId) ?? null)
        : null;
      if (row.clubId && !clubLabel) {
        throw new NotFoundException(`Club label missing for jersey ${row.id}`);
      }
      if (row.nationalTeamId && !nationalTeamLabel) {
        throw new NotFoundException(`National team label missing for jersey ${row.id}`);
      }

      const countryLabel = countryLabels.get(row.countryId);
      if (!countryLabel) {
        throw new NotFoundException(`Country label missing for jersey ${row.id}`);
      }

      const photos = photosByJersey.get(row.id);
      if (!photos || photos.length === 0) {
        throw new NotFoundException(`Photos missing for jersey ${row.id}`);
      }

      const leagueId = row.leagueId;
      const leagueLabel = leagueId ? (leagueLabels.get(leagueId) ?? null) : null;
      if (leagueId && !leagueLabel) {
        throw new NotFoundException(`League label missing for jersey ${row.id}`);
      }

      const playerFields = playerFieldsByJersey.get(row.id);

      return {
        id: row.id,
        clubId: row.clubId,
        nationalTeamId: row.nationalTeamId,
        seasonId: row.seasonId,
        countryId: row.countryId,
        leagueId,
        catalogKitId: row.catalogKitId,
        type: row.type,
        size: row.size,
        condition: row.condition,
        countryLabel,
        leagueLabel,
        clubLabel,
        nationalTeamLabel,
        seasonLabel: row.seasonLabel,
        squadPlayers:
          squadPlayersByScope.get(
            row.clubId
              ? `club:${row.clubId}:${row.seasonId}`
              : `nt:${row.nationalTeamId}:${row.seasonId}`,
          ) ?? [],
        playerId: row.playerId ?? null,
        playerLabel: playerFields?.label ?? null,
        playerNumber: playerFields?.number ?? null,
        patches: patchesByJersey.get(row.id) ?? [],
        photos,
        biddingEnabled: row.biddingEnabled,
        private: row.private,
      };
    });

    return collectionJerseysSchema.parse({ jerseys });
  }

  async listConversations(userId: string): Promise<CollectionConversations> {
    const participantRows = await this.db
      .select({
        conversationId: conversationParticipant.conversationId,
        lastReadAt: conversationParticipant.lastReadAt,
      })
      .from(conversationParticipant)
      .where(
        and(
          eq(conversationParticipant.userId, userId),
          sql`${conversationParticipant.hiddenAt} IS NULL`,
        ),
      );

    if (participantRows.length === 0) {
      return collectionConversationsSchema.parse({ conversations: [], unreadCount: 0 });
    }

    const conversationIds = participantRows.map((row) => row.conversationId);
    const lastReadByConversation = new Map(
      participantRows.map((row) => [row.conversationId, row.lastReadAt]),
    );

    const conversationRows = await this.db
      .select({
        id: conversation.id,
        lowerCollectorId: conversation.lowerCollectorId,
        upperCollectorId: conversation.upperCollectorId,
        updatedAt: conversation.updatedAt,
      })
      .from(conversation)
      .where(inArray(conversation.id, conversationIds))
      .orderBy(desc(conversation.updatedAt));

    const blockedPeerIds = await this.moderationService.getBlockedPeerIds(userId);
    const visibleConversationRows = conversationRows.filter((row) => {
      const peerId = row.lowerCollectorId === userId ? row.upperCollectorId : row.lowerCollectorId;
      return !blockedPeerIds.has(peerId);
    });

    const peerIds = visibleConversationRows.map((row) =>
      row.lowerCollectorId === userId ? row.upperCollectorId : row.lowerCollectorId,
    );
    const uniquePeerIds = [...new Set(peerIds)];

    const peerRows =
      uniquePeerIds.length === 0
        ? []
        : await this.db
            .select({ id: user.id, handle: user.handle })
            .from(user)
            .where(inArray(user.id, uniquePeerIds));

    const peerById = new Map(peerRows.map((row) => [row.id, row.handle]));

    const visibleConversationIds = visibleConversationRows.map((row) => row.id);

    const latestMessages = await this.db
      .select({
        conversationId: conversationMessage.conversationId,
        senderId: conversationMessage.senderId,
        kind: conversationMessage.kind,
        body: conversationMessage.body,
        bidAmountDkk: conversationMessage.bidAmountDkk,
        createdAt: conversationMessage.createdAt,
      })
      .from(conversationMessage)
      .where(inArray(conversationMessage.conversationId, visibleConversationIds))
      .orderBy(desc(conversationMessage.createdAt));

    const latestByConversation = new Map<string, (typeof latestMessages)[number]>();
    for (const message of latestMessages) {
      if (!latestByConversation.has(message.conversationId)) {
        latestByConversation.set(message.conversationId, message);
      }
    }

    const conversations = visibleConversationRows.map((row) => {
      const peerId = row.lowerCollectorId === userId ? row.upperCollectorId : row.lowerCollectorId;
      const peerHandle = peerById.get(peerId);
      if (!peerHandle) {
        throw new NotFoundException(`Peer handle missing for conversation ${row.id}`);
      }

      const latest = latestByConversation.get(row.id);
      const snippet =
        latest?.kind === "bid" && latest.bidAmountDkk
          ? bidSnippet(latest.bidAmountDkk)
          : latest?.kind === "image"
            ? "Billede"
            : (latest?.body ?? "Ny besked");

      const lastReadAt = lastReadByConversation.get(row.id);
      const unread =
        latest !== undefined &&
        latest.senderId !== userId &&
        (!lastReadAt || latest.createdAt > lastReadAt);

      return {
        id: row.id,
        peerHandle,
        peerInitial: handleInitial(peerHandle),
        snippet,
        updatedAt: (latest?.createdAt ?? row.updatedAt).toISOString(),
        unread,
      };
    });

    const unreadCount = conversations.filter((item) => item.unread).length;

    return collectionConversationsSchema.parse({ conversations, unreadCount });
  }

  async listActivity(userId: string, locale: LabelLocale = "da"): Promise<CollectionActivity> {
    const participantRows = await this.db
      .select({
        conversationId: conversationParticipant.conversationId,
        lastReadAt: conversationParticipant.lastReadAt,
      })
      .from(conversationParticipant)
      .where(
        and(
          eq(conversationParticipant.userId, userId),
          sql`${conversationParticipant.hiddenAt} IS NULL`,
        ),
      );

    if (participantRows.length === 0) {
      return collectionActivitySchema.parse({ items: [] });
    }

    const conversationIds = participantRows.map((row) => row.conversationId);
    const lastReadByConversation = new Map(
      participantRows.map((row) => [row.conversationId, row.lastReadAt]),
    );

    const latestMessages = await this.db
      .select({
        conversationId: conversationMessage.conversationId,
        senderId: conversationMessage.senderId,
        createdAt: conversationMessage.createdAt,
      })
      .from(conversationMessage)
      .where(inArray(conversationMessage.conversationId, conversationIds))
      .orderBy(desc(conversationMessage.createdAt));

    const latestByConversation = new Map<string, (typeof latestMessages)[number]>();
    for (const message of latestMessages) {
      if (!latestByConversation.has(message.conversationId)) {
        latestByConversation.set(message.conversationId, message);
      }
    }

    const bidRows = await this.db
      .select({
        id: conversationMessage.id,
        conversationId: conversationMessage.conversationId,
        senderId: conversationMessage.senderId,
        bidAmountDkk: conversationMessage.bidAmountDkk,
        bidStatus: conversationMessage.bidStatus,
        createdAt: conversationMessage.createdAt,
        ownerId: userJersey.userId,
        clubId: userJersey.clubId,
        nationalTeamId: userJersey.nationalTeamId,
        type: userJersey.type,
        seasonLabel: season.label,
      })
      .from(conversationMessage)
      .innerJoin(conversation, eq(conversationMessage.conversationId, conversation.id))
      .innerJoin(userJersey, eq(conversation.userJerseyId, userJersey.id))
      .innerJoin(season, eq(userJersey.seasonId, season.id))
      .where(
        and(
          inArray(conversationMessage.conversationId, conversationIds),
          eq(conversationMessage.kind, "bid"),
        ),
      )
      .orderBy(desc(conversationMessage.createdAt));

    const blockedPeerIds = await this.moderationService.getBlockedPeerIds(userId);
    const visibleBidRows = bidRows.filter((row) => {
      const peerId = row.ownerId === userId ? row.senderId : row.ownerId;
      return !blockedPeerIds.has(peerId);
    });

    if (visibleBidRows.length === 0) {
      return collectionActivitySchema.parse({ items: [] });
    }

    const clubIds = uniqueNonNullIds(visibleBidRows.map((row) => row.clubId));
    const nationalTeamIds = uniqueNonNullIds(visibleBidRows.map((row) => row.nationalTeamId));
    const [clubLabels, nationalTeamLabels] = await Promise.all([
      this.resolveEntityLabels("club", clubIds, locale),
      this.resolveEntityLabels("national_team", nationalTeamIds, locale),
    ]);

    const senderIds = [...new Set(visibleBidRows.map((row) => row.senderId))];
    const senderRows =
      senderIds.length === 0
        ? []
        : await this.db
            .select({ id: user.id, handle: user.handle })
            .from(user)
            .where(inArray(user.id, senderIds));
    const senderById = new Map(senderRows.map((row) => [row.id, row.handle]));

    const items = visibleBidRows.map((row) => {
      if (!row.bidAmountDkk || !row.bidStatus) {
        throw new NotFoundException("Bid message missing amount or status");
      }

      const side = discoverJerseySideFromLabels(row, clubLabels, nationalTeamLabels);
      if (!side) {
        throw new NotFoundException("Club label missing for activity");
      }

      const fromHandle = senderById.get(row.senderId);
      if (!fromHandle) {
        throw new NotFoundException("Sender handle missing for activity");
      }

      const viewerIsOwner = row.ownerId === userId;
      const kitLine = `${side.clubLabel} · ${row.seasonLabel} · ${KIT_TYPE_LABELS_DA[row.type]}`;

      const latest = latestByConversation.get(row.conversationId);
      const lastReadAt = lastReadByConversation.get(row.conversationId);
      const unread =
        latest !== undefined &&
        latest.senderId !== userId &&
        (!lastReadAt || latest.createdAt > lastReadAt);

      return {
        id: row.id,
        conversationId: row.conversationId,
        title: activityTitle(viewerIsOwner, row.bidStatus),
        kitLine,
        amountDkk: row.bidAmountDkk,
        status: row.bidStatus,
        fromHandle,
        unread,
        updatedAt: row.createdAt.toISOString(),
      };
    });

    return collectionActivitySchema.parse({ items });
  }

  async getConversationDetail(
    userId: string,
    conversationId: string,
    locale: LabelLocale = "da",
  ): Promise<CollectionConversationDetail> {
    await this.assertConversationParticipant(userId, conversationId);

    const [conversationRow] = await this.db
      .select({
        id: conversation.id,
        userJerseyId: conversation.userJerseyId,
        lowerCollectorId: conversation.lowerCollectorId,
        upperCollectorId: conversation.upperCollectorId,
      })
      .from(conversation)
      .where(eq(conversation.id, conversationId))
      .limit(1);

    if (!conversationRow) {
      throw new NotFoundException("Conversation not found");
    }

    const peerId =
      conversationRow.lowerCollectorId === userId
        ? conversationRow.upperCollectorId
        : conversationRow.lowerCollectorId;

    if (await this.moderationService.isBlocked(userId, peerId)) {
      throw new NotFoundException("Conversation not found");
    }

    const [peerRow] = await this.db
      .select({ handle: user.handle })
      .from(user)
      .where(eq(user.id, peerId))
      .limit(1);

    if (!peerRow) {
      throw new NotFoundException("Peer handle missing");
    }

    const [jerseyRow] = await this.db
      .select({
        clubId: userJersey.clubId,
        nationalTeamId: userJersey.nationalTeamId,
        type: userJersey.type,
        seasonLabel: season.label,
      })
      .from(userJersey)
      .innerJoin(season, eq(userJersey.seasonId, season.id))
      .where(eq(userJersey.id, conversationRow.userJerseyId))
      .limit(1);

    let jerseyContext: CollectionConversationDetail["jerseyContext"];
    if (jerseyRow) {
      const { clubLabels, nationalTeamLabels } = await this.loadSideLabels([jerseyRow], locale);
      const side = discoverJerseySideFromLabels(jerseyRow, clubLabels, nationalTeamLabels);
      if (side) {
        jerseyContext = {
          clubLabel: side.clubLabel,
          seasonLabel: jerseyRow.seasonLabel,
          type: jerseyRow.type,
        };
      }
    }

    const messageRows = await this.db
      .select({
        id: conversationMessage.id,
        senderId: conversationMessage.senderId,
        kind: conversationMessage.kind,
        body: conversationMessage.body,
        imageObjectKey: conversationMessage.imageObjectKey,
        replyToMessageId: conversationMessage.replyToMessageId,
        bidAmountDkk: conversationMessage.bidAmountDkk,
        bidStatus: conversationMessage.bidStatus,
        createdAt: conversationMessage.createdAt,
      })
      .from(conversationMessage)
      .where(eq(conversationMessage.conversationId, conversationId))
      .orderBy(asc(conversationMessage.createdAt));

    const replyIds = messageRows
      .map((row) => row.replyToMessageId)
      .filter((id): id is string => Boolean(id));
    const replyBodies =
      replyIds.length === 0
        ? new Map<string, string>()
        : new Map(
            (
              await this.db
                .select({ id: conversationMessage.id, body: conversationMessage.body })
                .from(conversationMessage)
                .where(inArray(conversationMessage.id, replyIds))
            )
              .filter((row) => Boolean(row.body))
              .map((row) => [row.id, row.body!] as const),
          );

    const messages = messageRows.map((row) => {
      const role = row.senderId === userId ? ("outgoing" as const) : ("incoming" as const);
      const replyText = row.replyToMessageId ? replyBodies.get(row.replyToMessageId) : undefined;

      return {
        id: row.id,
        kind: row.kind,
        role,
        text: row.body ?? undefined,
        imageUrl:
          row.kind === "image" && row.imageObjectKey
            ? `/v1/collection/conversations/${conversationId}/messages/${row.id}/photo`
            : undefined,
        bidAmountDkk: row.bidAmountDkk ?? undefined,
        bidStatus: row.bidStatus ?? undefined,
        createdAt: row.createdAt.toISOString(),
        replyTo:
          row.replyToMessageId && replyText
            ? { id: row.replyToMessageId, text: replyText }
            : undefined,
      };
    });

    await this.db
      .update(conversationParticipant)
      .set({ lastReadAt: new Date() })
      .where(
        and(
          eq(conversationParticipant.conversationId, conversationId),
          eq(conversationParticipant.userId, userId),
        ),
      );

    return collectionConversationDetailSchema.parse({
      id: conversationId,
      peerHandle: peerRow.handle,
      jerseyContext,
      messages,
    });
  }

  async sendConversationMessage(
    userId: string,
    conversationId: string,
    rawBody: unknown,
  ): Promise<CollectionSendMessageResponse> {
    await this.assertConversationParticipant(userId, conversationId);
    await this.assertConversationNotBlocked(userId, conversationId);
    const body = collectionSendMessageRequestSchema.parse(rawBody);

    const hasText = Boolean(body.text?.trim());
    const hasImage = Boolean(body.contentBase64);
    const kind = hasImage ? "image" : "text";

    let imageObjectKey: string | undefined;
    let presetMessageId: string | undefined;
    if (hasImage) {
      const bytes = decodeBase64Photo(body.contentBase64!);
      presetMessageId = crypto.randomUUID();
      imageObjectKey = `conversation/${conversationId}/${presetMessageId}.jpg`;
      await this.objectStore.putObject(imageObjectKey, bytes);

      const exists = await this.objectStore.objectExists(imageObjectKey);
      if (!exists) {
        throw new BadRequestException(`Object store missing key after put: ${imageObjectKey}`);
      }
    }

    if (body.replyToMessageId) {
      const [replyRow] = await this.db
        .select({ id: conversationMessage.id })
        .from(conversationMessage)
        .where(
          and(
            eq(conversationMessage.id, body.replyToMessageId),
            eq(conversationMessage.conversationId, conversationId),
          ),
        )
        .limit(1);

      if (!replyRow) {
        throw new BadRequestException("Reply target message not found in conversation");
      }
    }

    const [insertedMessage] = await this.db
      .insert(conversationMessage)
      .values({
        ...(presetMessageId ? { id: presetMessageId } : {}),
        conversationId,
        senderId: userId,
        kind,
        body: hasText ? body.text?.trim() : null,
        imageObjectKey: imageObjectKey ?? null,
        replyToMessageId: body.replyToMessageId ?? null,
      })
      .returning({ id: conversationMessage.id });

    if (!insertedMessage) {
      throw new BadRequestException("Could not create message");
    }

    await this.db
      .update(conversation)
      .set({ updatedAt: new Date() })
      .where(eq(conversation.id, conversationId));

    return collectionSendMessageResponseSchema.parse({ messageId: insertedMessage.id });
  }

  async getConversationMessagePhotoBytes(
    userId: string,
    conversationId: string,
    messageId: string,
  ): Promise<Uint8Array> {
    await this.assertConversationParticipant(userId, conversationId);

    const [row] = await this.db
      .select({
        kind: conversationMessage.kind,
        imageObjectKey: conversationMessage.imageObjectKey,
      })
      .from(conversationMessage)
      .where(
        and(
          eq(conversationMessage.id, messageId),
          eq(conversationMessage.conversationId, conversationId),
        ),
      )
      .limit(1);

    if (row?.kind !== "image" || !row.imageObjectKey) {
      throw new NotFoundException("Message photo not found");
    }

    if (!row.imageObjectKey.startsWith(`conversation/${conversationId}/`)) {
      throw new NotFoundException("Message photo not found");
    }

    const bytes = await this.objectStore.getObject(row.imageObjectKey);
    if (!bytes) {
      throw new NotFoundException("Message photo bytes missing");
    }

    return bytes;
  }

  private async assertConversationParticipant(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    const [participant] = await this.db
      .select({ conversationId: conversationParticipant.conversationId })
      .from(conversationParticipant)
      .where(
        and(
          eq(conversationParticipant.conversationId, conversationId),
          eq(conversationParticipant.userId, userId),
          sql`${conversationParticipant.hiddenAt} IS NULL`,
        ),
      )
      .limit(1);

    if (!participant) {
      throw new NotFoundException("Conversation not found");
    }
  }

  private async assertConversationNotBlocked(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    const [conversationRow] = await this.db
      .select({
        lowerCollectorId: conversation.lowerCollectorId,
        upperCollectorId: conversation.upperCollectorId,
      })
      .from(conversation)
      .where(eq(conversation.id, conversationId))
      .limit(1);

    if (!conversationRow) {
      throw new NotFoundException("Conversation not found");
    }

    const peerId =
      conversationRow.lowerCollectorId === userId
        ? conversationRow.upperCollectorId
        : conversationRow.lowerCollectorId;

    if (await this.moderationService.isBlocked(userId, peerId)) {
      throw new NotFoundException("Conversation not found");
    }
  }

  async getConversationPeer(
    userId: string,
    conversationId: string,
  ): Promise<CollectionConversationPeer> {
    await this.assertConversationParticipant(userId, conversationId);

    const [conversationRow] = await this.db
      .select({
        lowerCollectorId: conversation.lowerCollectorId,
        upperCollectorId: conversation.upperCollectorId,
      })
      .from(conversation)
      .where(eq(conversation.id, conversationId))
      .limit(1);

    if (!conversationRow) {
      throw new NotFoundException("Conversation not found");
    }

    const peerId =
      conversationRow.lowerCollectorId === userId
        ? conversationRow.upperCollectorId
        : conversationRow.lowerCollectorId;

    if (await this.moderationService.isBlocked(userId, peerId)) {
      throw new NotFoundException("Conversation not found");
    }

    const [peerRow] = await this.db
      .select({
        handle: user.handle,
        city: user.city,
        showCity: user.showCity,
      })
      .from(user)
      .where(eq(user.id, peerId))
      .limit(1);

    if (!peerRow) {
      throw new NotFoundException("Peer not found");
    }

    const [jerseyCountRow] = await this.db
      .select({ count: count() })
      .from(userJersey)
      .where(and(eq(userJersey.userId, peerId), eq(userJersey.private, false)));

    return collectionConversationPeerSchema.parse({
      peerId,
      handle: peerRow.handle,
      jerseyCount: Number(jerseyCountRow?.count ?? 0),
      ...(peerRow.showCity && peerRow.city ? { city: peerRow.city } : {}),
    });
  }

  async listPeerJerseys(
    userId: string,
    peerUserId: string,
    locale: LabelLocale = "da",
  ): Promise<CollectionPeerJerseys> {
    if (peerUserId === userId) {
      throw new NotFoundException("Peer not found");
    }

    if (await this.moderationService.isBlocked(userId, peerUserId)) {
      throw new NotFoundException("Peer not found");
    }

    const [peerRow] = await this.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, peerUserId))
      .limit(1);

    if (!peerRow) {
      throw new NotFoundException("Peer not found");
    }

    const rows = await this.db
      .select({
        id: userJersey.id,
        clubId: userJersey.clubId,
        nationalTeamId: userJersey.nationalTeamId,
        seasonId: userJersey.seasonId,
        type: userJersey.type,
        seasonLabel: season.label,
        ownerHandle: user.handle,
      })
      .from(userJersey)
      .innerJoin(season, eq(userJersey.seasonId, season.id))
      .innerJoin(user, eq(userJersey.userId, user.id))
      .where(and(eq(userJersey.userId, peerUserId), eq(userJersey.private, false)))
      .orderBy(desc(userJersey.updatedAt));

    if (rows.length === 0) {
      return collectionPeerJerseysSchema.parse({ jerseys: [] });
    }

    const jerseys = await this.decorateDiscoverJerseys(rows, locale);

    return collectionPeerJerseysSchema.parse({ jerseys });
  }

  async hideConversation(userId: string, conversationId: string): Promise<void> {
    await this.assertConversationParticipant(userId, conversationId);

    await this.db
      .update(conversationParticipant)
      .set({ hiddenAt: new Date() })
      .where(
        and(
          eq(conversationParticipant.conversationId, conversationId),
          eq(conversationParticipant.userId, userId),
        ),
      );
  }

  async patchBidding(userId: string, jerseyId: string, rawBody: unknown) {
    const body = collectionBiddingPatchSchema.parse(rawBody);

    const [row] = await this.db
      .select({ id: userJersey.id })
      .from(userJersey)
      .where(and(eq(userJersey.id, jerseyId), eq(userJersey.userId, userId)))
      .limit(1);

    if (!row) {
      throw new NotFoundException("UserJersey not found");
    }

    await this.db
      .update(userJersey)
      .set({
        // The DB re-checks `private` in the same statement, so a concurrent private
        // toggle cannot leave `private: true` with `biddingEnabled: true` persisted.
        biddingEnabled: sql`case when ${userJersey.private} then false else ${body.biddingEnabled} end`,
        updatedAt: new Date(),
      })
      .where(eq(userJersey.id, jerseyId));

    return { jersey: await this.loadOwnJerseyOrThrow(userId, jerseyId) };
  }

  async patchPrivate(userId: string, jerseyId: string, rawBody: unknown) {
    const body = collectionPrivatePatchSchema.parse(rawBody);

    const [row] = await this.db
      .select({ id: userJersey.id, biddingEnabled: userJersey.biddingEnabled })
      .from(userJersey)
      .where(and(eq(userJersey.id, jerseyId), eq(userJersey.userId, userId)))
      .limit(1);

    if (!row) {
      throw new NotFoundException("UserJersey not found");
    }

    // Private jerseys never bid: setting private true forces biddingEnabled false
    // in the same UPDATE; clearing it keeps whatever the row's value was.
    const biddingEnabled = body.private ? false : row.biddingEnabled;

    await this.db
      .update(userJersey)
      .set({ private: body.private, biddingEnabled, updatedAt: new Date() })
      .where(eq(userJersey.id, jerseyId));

    return { jersey: await this.loadOwnJerseyOrThrow(userId, jerseyId) };
  }

  async updateJersey(userId: string, jerseyId: string, rawBody: unknown) {
    const body = collectionJerseyUpdateSchema.parse(rawBody);

    const [existing] = await this.db
      .select({ id: userJersey.id })
      .from(userJersey)
      .where(and(eq(userJersey.id, jerseyId), eq(userJersey.userId, userId)))
      .limit(1);

    if (!existing) {
      throw new NotFoundException("UserJersey not found");
    }

    const side = await resolveCatalogJerseySide(this.db, {
      clubId: body.clubId,
      nationalTeamId: body.nationalTeamId,
    });
    await assertSeasonLinkedToSide(this.db, side, body.seasonId);

    await this.assertOptionalPlayerScoped(side, body.seasonId, body.playerId);
    await this.assertOptionalPatchesScoped(body.seasonId, body.patchIds);

    await this.db
      .update(userJersey)
      .set({
        clubId: side.clubId,
        nationalTeamId: side.nationalTeamId,
        seasonId: body.seasonId,
        playerId: body.playerId ?? null,
        catalogKitId: body.catalogKitId ?? null,
        type: body.type,
        size: body.size,
        condition: body.condition,
        updatedAt: new Date(),
      })
      .where(and(eq(userJersey.id, jerseyId), eq(userJersey.userId, userId)));

    await this.db.delete(userJerseyPatch).where(eq(userJerseyPatch.userJerseyId, jerseyId));
    if (body.patchIds?.length) {
      await this.db.insert(userJerseyPatch).values(
        body.patchIds.map((patchId) => ({
          userJerseyId: jerseyId,
          patchId,
        })),
      );
    }

    return { jersey: await this.loadOwnJerseyOrThrow(userId, jerseyId) };
  }

  async deleteOwnJersey(userId: string, jerseyId: string): Promise<void> {
    const [jerseyRow] = await this.db
      .select({ id: userJersey.id })
      .from(userJersey)
      .where(and(eq(userJersey.id, jerseyId), eq(userJersey.userId, userId)))
      .limit(1);

    if (!jerseyRow) {
      throw new NotFoundException("UserJersey not found");
    }

    const photoRows = await this.db
      .select({
        id: userJerseyPhoto.id,
        objectKey: userJerseyPhoto.objectKey,
      })
      .from(userJerseyPhoto)
      .where(eq(userJerseyPhoto.userJerseyId, jerseyId));

    const photoBytes = new Map<string, Uint8Array>();
    const keysToDelete = new Set<string>();
    for (const photo of photoRows) {
      if (!photo.objectKey.startsWith(`user/${userId}/${jerseyId}/`)) {
        throw new InternalServerErrorException("Invalid photo object key");
      }
      for (const key of photoObjectKeysForDeletion(photo.objectKey)) {
        keysToDelete.add(key);
      }
    }

    for (const key of keysToDelete) {
      const bytes = await this.objectStore.getObject(key);
      if (bytes) {
        photoBytes.set(key, bytes);
      }
    }

    const deletedKeys: string[] = [];
    try {
      for (const key of keysToDelete) {
        if (!(await this.objectStore.objectExists(key))) {
          continue;
        }
        await this.objectStore.deleteObject(key);
        deletedKeys.push(key);
      }
    } catch {
      for (const key of deletedKeys) {
        const bytes = photoBytes.get(key);
        if (bytes) {
          await this.objectStore.putObject(key, bytes);
        }
      }
      throw new InternalServerErrorException("Failed to delete photo bytes");
    }

    await this.db.transaction(async (tx) => {
      const jerseyConversations = await tx
        .select({ id: conversation.id })
        .from(conversation)
        .where(eq(conversation.userJerseyId, jerseyId));
      const conversationIds = jerseyConversations.map((row) => row.id);

      if (conversationIds.length > 0) {
        await tx
          .delete(conversationMessage)
          .where(inArray(conversationMessage.conversationId, conversationIds));
        await tx
          .delete(conversationParticipant)
          .where(inArray(conversationParticipant.conversationId, conversationIds));
        await tx.delete(conversation).where(eq(conversation.userJerseyId, jerseyId));
      }

      await tx.delete(visionLog).where(eq(visionLog.userJerseyId, jerseyId));
      await tx.delete(jerseyDraft).where(eq(jerseyDraft.userJerseyId, jerseyId));
      await tx.delete(userJerseyFavorite).where(eq(userJerseyFavorite.userJerseyId, jerseyId));
      await tx.delete(userJerseyPhoto).where(eq(userJerseyPhoto.userJerseyId, jerseyId));
      await tx
        .delete(userJersey)
        .where(and(eq(userJersey.id, jerseyId), eq(userJersey.userId, userId)));
    });
  }

  private async loadOwnJerseyOrThrow(userId: string, jerseyId: string): Promise<CollectionJersey> {
    const jerseys = await this.listJerseys(userId);
    const jersey = jerseys.jerseys.find((item) => item.id === jerseyId);
    if (!jersey) {
      throw new NotFoundException("UserJersey not found after update");
    }
    return jersey;
  }

  async discoverJerseys(
    userId: string,
    query: string | undefined,
    locale: LabelLocale = "da",
  ): Promise<CollectionDiscoverJerseys> {
    const blockedPeerIds = await this.moderationService.getBlockedPeerIds(userId);
    const rows = await this.db
      .select({
        id: userJersey.id,
        ownerId: userJersey.userId,
        clubId: userJersey.clubId,
        nationalTeamId: userJersey.nationalTeamId,
        seasonId: userJersey.seasonId,
        type: userJersey.type,
        seasonLabel: season.label,
        ownerHandle: user.handle,
      })
      .from(userJersey)
      .innerJoin(season, eq(userJersey.seasonId, season.id))
      .innerJoin(user, eq(userJersey.userId, user.id))
      .where(
        and(
          ne(userJersey.userId, userId),
          eq(userJersey.biddingEnabled, true),
          eq(userJersey.private, false),
        ),
      )
      .orderBy(desc(userJersey.updatedAt));

    const visibleRows = rows.filter((row) => !blockedPeerIds.has(row.ownerId));

    if (visibleRows.length === 0) {
      return collectionDiscoverJerseysSchema.parse({ jerseys: [] });
    }

    const { clubLabels, nationalTeamLabels } = await this.loadSideLabels(visibleRows, locale);
    const normalizedQuery = query?.trim().toLowerCase() ?? "";

    const filteredRows = visibleRows.filter((row) => {
      const side = discoverJerseySideFromLabels(row, clubLabels, nationalTeamLabels);
      if (!side) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      const haystack = `${side.clubLabel} ${row.seasonLabel}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });

    if (filteredRows.length === 0) {
      return collectionDiscoverJerseysSchema.parse({ jerseys: [] });
    }

    const photosByJersey = await this.loadPhotosForJerseys(filteredRows.map((row) => row.id));

    const jerseys = filteredRows.flatMap((row) => {
      const side = discoverJerseySideFromLabels(row, clubLabels, nationalTeamLabels);
      const photos = photosByJersey.get(row.id);
      if (!side || !photos || photos.length === 0) {
        return [];
      }

      return [
        {
          id: row.id,
          ...side,
          seasonId: row.seasonId,
          type: row.type,
          seasonLabel: row.seasonLabel,
          ownerHandle: row.ownerHandle,
          photos,
        },
      ];
    });

    return collectionDiscoverJerseysSchema.parse({ jerseys });
  }

  async listShowcaseJerseys(locale: LabelLocale = "da"): Promise<CollectionShowcaseJerseys> {
    const rows = await this.db
      .select({
        id: userJersey.id,
        clubId: userJersey.clubId,
        nationalTeamId: userJersey.nationalTeamId,
        seasonId: userJersey.seasonId,
        type: userJersey.type,
        seasonLabel: season.label,
      })
      .from(userJersey)
      .innerJoin(season, eq(userJersey.seasonId, season.id))
      .where(eq(userJersey.private, false))
      .orderBy(desc(userJersey.updatedAt))
      .limit(COLLECTION_SHOWCASE_JERSEY_CAP);

    if (rows.length === 0) {
      return collectionShowcaseJerseysSchema.parse({ jerseys: [] });
    }

    const clubIds = uniqueNonNullIds(rows.map((row) => row.clubId));
    const nationalTeamIds = uniqueNonNullIds(rows.map((row) => row.nationalTeamId));
    const [clubLabels, nationalTeamLabels, photosByJersey] = await Promise.all([
      this.resolveEntityLabels("club", clubIds, locale),
      this.resolveEntityLabels("national_team", nationalTeamIds, locale),
      this.loadPhotosForJerseys(
        rows.map((row) => row.id),
        "showcase",
      ),
    ]);

    const jerseys = rows.flatMap((row) => {
      const side = discoverJerseySideFromLabels(row, clubLabels, nationalTeamLabels);
      const photos = photosByJersey.get(row.id);
      if (!side || !photos || photos.length === 0) {
        return [];
      }

      return [
        {
          id: row.id,
          clubLabel: side.clubLabel,
          seasonLabel: row.seasonLabel,
          type: row.type,
          photos,
        },
      ];
    });

    return collectionShowcaseJerseysSchema.parse({ jerseys });
  }

  async discoverHome(userId: string, locale: LabelLocale = "da"): Promise<CollectionDiscoverHome> {
    const blockedPeerIds = await this.moderationService.getBlockedPeerIds(userId);
    const rows = await this.db
      .select({
        id: userJersey.id,
        ownerId: userJersey.userId,
        clubId: userJersey.clubId,
        nationalTeamId: userJersey.nationalTeamId,
        seasonId: userJersey.seasonId,
        type: userJersey.type,
        biddingEnabled: userJersey.biddingEnabled,
        seasonLabel: season.label,
        ownerHandle: user.handle,
        ownerAvatarObjectKey: user.avatarObjectKey,
      })
      .from(userJersey)
      .innerJoin(season, eq(userJersey.seasonId, season.id))
      .innerJoin(user, eq(userJersey.userId, user.id))
      .where(and(ne(userJersey.userId, userId), eq(userJersey.private, false)))
      .orderBy(desc(userJersey.updatedAt));

    const visibleRows = rows.filter((row) => !blockedPeerIds.has(row.ownerId));
    if (visibleRows.length === 0) {
      return collectionDiscoverHomeSchema.parse({});
    }

    const moreJerseys = await this.decorateDiscoverJerseys(visibleRows, locale);

    const clubs: CollectionDiscoverHomeClub[] = [];
    const seenClubs = new Set<string>();
    const nationalTeams: CollectionDiscoverHomeNationalTeam[] = [];
    const seenNationalTeams = new Set<string>();
    for (const jersey of moreJerseys) {
      if (jersey.clubId) {
        if (seenClubs.has(jersey.clubId)) {
          continue;
        }
        seenClubs.add(jersey.clubId);
        clubs.push({ clubId: jersey.clubId, clubLabel: jersey.clubLabel });
        continue;
      }
      if (jersey.nationalTeamId && !seenNationalTeams.has(jersey.nationalTeamId)) {
        seenNationalTeams.add(jersey.nationalTeamId);
        nationalTeams.push({
          nationalTeamId: jersey.nationalTeamId,
          nationalTeamLabel: jersey.clubLabel,
        });
      }
    }

    const openForBid = moreJerseys.filter((jersey) => {
      const row = visibleRows.find((item) => item.id === jersey.id);
      return row?.biddingEnabled === true;
    });

    const collectors: CollectionDiscoverHomeCollector[] = [];
    const seenCollectors = new Set<string>();
    for (const row of visibleRows) {
      if (seenCollectors.has(row.ownerId) || !moreJerseys.some((jersey) => jersey.id === row.id)) {
        continue;
      }
      seenCollectors.add(row.ownerId);
      collectors.push({
        handle: row.ownerHandle,
        initial: handleInitial(row.ownerHandle),
        avatarUrl: row.ownerAvatarObjectKey ? `/v1/identity/peers/${row.ownerId}/avatar` : null,
      });
    }

    return collectionDiscoverHomeSchema.parse({
      ...(clubs.length > 0 ? { clubs } : {}),
      ...(nationalTeams.length > 0 ? { nationalTeams } : {}),
      ...(openForBid.length > 0 ? { openForBid } : {}),
      ...(collectors.length > 0 ? { collectors } : {}),
      ...(moreJerseys.length > 0 ? { moreJerseys } : {}),
    });
  }

  async discoverCatalogDrill(
    userId: string,
    kind: "club" | "national_team" | "player" | "kit",
    entityId: string,
    locale: LabelLocale = "da",
  ): Promise<CollectionDiscoverCatalogDrill> {
    const title = await this.resolveCatalogDrillTitle(kind, entityId, locale);
    if (!title) {
      throw new NotFoundException("Catalog drill not found");
    }

    const blockedPeerIds = await this.moderationService.getBlockedPeerIds(userId);
    const baseWhere = and(ne(userJersey.userId, userId), eq(userJersey.private, false));
    const drillSelect = {
      id: userJersey.id,
      ownerId: userJersey.userId,
      clubId: userJersey.clubId,
      nationalTeamId: userJersey.nationalTeamId,
      seasonId: userJersey.seasonId,
      type: userJersey.type,
      seasonLabel: season.label,
      ownerHandle: user.handle,
    } as const;

    const rows =
      kind === "club"
        ? await this.db
            .select(drillSelect)
            .from(userJersey)
            .innerJoin(season, eq(userJersey.seasonId, season.id))
            .innerJoin(user, eq(userJersey.userId, user.id))
            .where(and(baseWhere, eq(userJersey.clubId, entityId)))
            .orderBy(desc(userJersey.updatedAt))
        : kind === "national_team"
          ? await this.db
              .select(drillSelect)
              .from(userJersey)
              .innerJoin(season, eq(userJersey.seasonId, season.id))
              .innerJoin(user, eq(userJersey.userId, user.id))
              .where(and(baseWhere, eq(userJersey.nationalTeamId, entityId)))
              .orderBy(desc(userJersey.updatedAt))
          : kind === "player"
            ? await this.db
                .select(drillSelect)
                .from(userJersey)
                .innerJoin(season, eq(userJersey.seasonId, season.id))
                .innerJoin(user, eq(userJersey.userId, user.id))
                .leftJoin(
                  playerClubSeason,
                  and(
                    eq(playerClubSeason.clubId, userJersey.clubId),
                    eq(playerClubSeason.seasonId, userJersey.seasonId),
                    eq(playerClubSeason.playerId, entityId),
                  ),
                )
                .leftJoin(
                  playerNationalTeamSeason,
                  and(
                    eq(playerNationalTeamSeason.nationalTeamId, userJersey.nationalTeamId),
                    eq(playerNationalTeamSeason.seasonId, userJersey.seasonId),
                    eq(playerNationalTeamSeason.playerId, entityId),
                  ),
                )
                .where(
                  and(
                    baseWhere,
                    or(
                      sql`${playerClubSeason.playerId} IS NOT NULL`,
                      sql`${playerNationalTeamSeason.playerId} IS NOT NULL`,
                    ),
                  ),
                )
                .orderBy(desc(userJersey.updatedAt))
            : await this.db
                .select(drillSelect)
                .from(userJersey)
                .innerJoin(season, eq(userJersey.seasonId, season.id))
                .innerJoin(user, eq(userJersey.userId, user.id))
                .where(and(baseWhere, eq(userJersey.catalogKitId, entityId)))
                .orderBy(desc(userJersey.updatedAt));

    const visibleRows = rows.filter((row) => !blockedPeerIds.has(row.ownerId));
    const jerseys = await this.decorateDiscoverJerseys(visibleRows, locale);

    return collectionDiscoverCatalogDrillSchema.parse({
      kind,
      id: entityId,
      title,
      count: jerseys.length,
      jerseys,
    });
  }

  async discoverTypeahead(
    userId: string,
    query: string | undefined,
    locale: LabelLocale = "da",
  ): Promise<CollectionDiscoverTypeahead> {
    const normalizedQuery = query?.trim() ?? "";
    if (!normalizedQuery) {
      throw new BadRequestException("Query is required");
    }

    const pattern = `%${normalizedQuery}%`;
    const blockedPeerIds = await this.moderationService.getBlockedPeerIds(userId);

    const clubMatches = await this.db
      .selectDistinct({ entityId: catalogLabel.entityId })
      .from(catalogLabel)
      .where(and(eq(catalogLabel.entityType, "club"), sql`${catalogLabel.text} ilike ${pattern}`));
    const clubIds = clubMatches.map((row) => row.entityId);
    const clubLabels = await this.resolveEntityLabels("club", clubIds, locale);
    const clubs = clubIds.flatMap((clubId) => {
      const clubLabel = clubLabels.get(clubId);
      return clubLabel ? [{ clubId, clubLabel }] : [];
    });

    const nationalTeamMatches = await this.db
      .selectDistinct({ entityId: catalogLabel.entityId })
      .from(catalogLabel)
      .where(
        and(
          eq(catalogLabel.entityType, "national_team"),
          sql`${catalogLabel.text} ilike ${pattern}`,
        ),
      );
    const nationalTeamIds = nationalTeamMatches.map((row) => row.entityId);
    const nationalTeamLabels = await this.resolveEntityLabels(
      "national_team",
      nationalTeamIds,
      locale,
    );
    const nationalTeams: CollectionDiscoverHomeNationalTeam[] = nationalTeamIds.flatMap(
      (nationalTeamId) => {
        const nationalTeamLabel = nationalTeamLabels.get(nationalTeamId);
        return nationalTeamLabel ? [{ nationalTeamId, nationalTeamLabel }] : [];
      },
    );

    const playerMatches = await this.db
      .selectDistinct({ entityId: catalogLabel.entityId })
      .from(catalogLabel)
      .where(
        and(eq(catalogLabel.entityType, "player"), sql`${catalogLabel.text} ilike ${pattern}`),
      );
    const playerIds = playerMatches.map((row) => row.entityId);
    const playerLabels = await this.resolveEntityLabels("player", playerIds, locale);
    const players: CollectionDiscoverTypeaheadPlayer[] = playerIds.flatMap((playerId) => {
      const playerLabel = playerLabels.get(playerId);
      return playerLabel ? [{ playerId, playerLabel }] : [];
    });

    const kitRows = await this.db
      .select({
        id: kit.id,
        clubId: kit.clubId,
        nationalTeamId: kit.nationalTeamId,
        type: kit.type,
        seasonLabel: season.label,
      })
      .from(kit)
      .innerJoin(season, eq(kit.seasonId, season.id));
    const kitClubIds = uniqueNonNullIds(kitRows.map((row) => row.clubId));
    const kitNationalTeamIds = uniqueNonNullIds(kitRows.map((row) => row.nationalTeamId));
    const [kitClubLabels, kitNationalTeamLabels, kitClubSearchTexts, kitNationalTeamSearchTexts] =
      await Promise.all([
        this.resolveEntityLabels("club", kitClubIds, locale),
        this.resolveEntityLabels("national_team", kitNationalTeamIds, locale),
        this.resolveEntitySearchTexts("club", kitClubIds),
        this.resolveEntitySearchTexts("national_team", kitNationalTeamIds),
      ]);
    const kits: CollectionDiscoverTypeaheadKit[] = kitRows.flatMap((row) => {
      const sideLabel = row.clubId
        ? kitClubLabels.get(row.clubId)
        : row.nationalTeamId
          ? kitNationalTeamLabels.get(row.nationalTeamId)
          : undefined;
      if (!sideLabel) {
        return [];
      }
      const searchTexts = row.clubId
        ? (kitClubSearchTexts.get(row.clubId) ?? [])
        : row.nationalTeamId
          ? (kitNationalTeamSearchTexts.get(row.nationalTeamId) ?? [])
          : [];
      if (
        !typeaheadTextMatches(
          [...searchTexts, row.seasonLabel, KIT_TYPE_LABELS_DA[row.type]],
          normalizedQuery,
        )
      ) {
        return [];
      }
      return [
        {
          kitId: row.id,
          label: `${sideLabel} ${row.seasonLabel} ${KIT_TYPE_LABELS_DA[row.type]}`,
        },
      ];
    });

    const collectorRows = await this.db
      .select({
        id: user.id,
        handle: user.handle,
        avatarObjectKey: user.avatarObjectKey,
      })
      .from(user)
      .where(and(ne(user.id, userId), sql`${user.handle} ilike ${pattern}`));
    const collectors = collectorRows
      .filter((row) => !blockedPeerIds.has(row.id))
      .map((row) => ({
        handle: row.handle,
        initial: handleInitial(row.handle),
        avatarUrl: row.avatarObjectKey ? `/v1/identity/peers/${row.id}/avatar` : null,
      }));

    const jerseyRows = await this.db
      .select({
        id: userJersey.id,
        ownerId: userJersey.userId,
        clubId: userJersey.clubId,
        nationalTeamId: userJersey.nationalTeamId,
        seasonId: userJersey.seasonId,
        type: userJersey.type,
        seasonLabel: season.label,
        ownerHandle: user.handle,
      })
      .from(userJersey)
      .innerJoin(season, eq(userJersey.seasonId, season.id))
      .innerJoin(user, eq(userJersey.userId, user.id))
      .where(and(ne(userJersey.userId, userId), eq(userJersey.private, false)))
      .orderBy(desc(userJersey.updatedAt));
    const visibleJerseyRows = jerseyRows.filter((row) => !blockedPeerIds.has(row.ownerId));
    const decoratedJerseys = await this.decorateDiscoverJerseys(visibleJerseyRows, locale);
    const jerseyClubIds = uniqueNonNullIds(visibleJerseyRows.map((row) => row.clubId));
    const jerseyNationalTeamIds = uniqueNonNullIds(
      visibleJerseyRows.map((row) => row.nationalTeamId),
    );
    const [jerseyClubSearchTexts, jerseyNationalTeamSearchTexts] = await Promise.all([
      this.resolveEntitySearchTexts("club", jerseyClubIds),
      this.resolveEntitySearchTexts("national_team", jerseyNationalTeamIds),
    ]);
    const jerseys = decoratedJerseys.filter((jersey) => {
      const searchTexts = jersey.clubId
        ? (jerseyClubSearchTexts.get(jersey.clubId) ?? [])
        : jersey.nationalTeamId
          ? (jerseyNationalTeamSearchTexts.get(jersey.nationalTeamId) ?? [])
          : [];
      return typeaheadTextMatches(
        [...searchTexts, jersey.clubLabel, jersey.seasonLabel, jersey.ownerHandle],
        normalizedQuery,
      );
    });

    return collectionDiscoverTypeaheadSchema.parse({
      ...(clubs.length > 0 ? { clubs } : {}),
      ...(nationalTeams.length > 0 ? { nationalTeams } : {}),
      ...(kits.length > 0 ? { kits } : {}),
      ...(players.length > 0 ? { players } : {}),
      ...(collectors.length > 0 ? { collectors } : {}),
      ...(jerseys.length > 0 ? { jerseys } : {}),
    });
  }

  async getPeerJersey(
    userId: string,
    jerseyId: string,
    locale: LabelLocale = "da",
  ): Promise<CollectionPeerJersey> {
    const [row] = await this.db
      .select({
        id: userJersey.id,
        userId: userJersey.userId,
        clubId: userJersey.clubId,
        nationalTeamId: userJersey.nationalTeamId,
        seasonId: userJersey.seasonId,
        type: userJersey.type,
        seasonLabel: season.label,
        ownerHandle: user.handle,
        biddingEnabled: userJersey.biddingEnabled,
        private: userJersey.private,
      })
      .from(userJersey)
      .innerJoin(season, eq(userJersey.seasonId, season.id))
      .innerJoin(user, eq(userJersey.userId, user.id))
      .where(eq(userJersey.id, jerseyId))
      .limit(1);

    // Own copies, private copies, blocked peers, and unknown ids are indistinguishable.
    if (!row || row.userId === userId || row.private) {
      throw new NotFoundException("UserJersey not found");
    }

    if (await this.moderationService.isBlocked(userId, row.userId)) {
      throw new NotFoundException("UserJersey not found");
    }

    const { clubLabels, nationalTeamLabels } = await this.loadSideLabels([row], locale);
    const side = discoverJerseySideFromLabels(row, clubLabels, nationalTeamLabels);
    if (!side) {
      throw new NotFoundException("Club label missing");
    }

    const photosByJersey = await this.loadPhotosForJerseys([row.id]);
    const photos = photosByJersey.get(row.id);
    if (!photos || photos.length === 0) {
      throw new NotFoundException("Photos missing");
    }

    const [latestBid] = await this.db
      .select({ amount: conversationMessage.bidAmountDkk })
      .from(conversationMessage)
      .innerJoin(conversation, eq(conversationMessage.conversationId, conversation.id))
      .where(and(eq(conversation.userJerseyId, jerseyId), eq(conversationMessage.kind, "bid")))
      .orderBy(desc(conversationMessage.createdAt))
      .limit(1);

    return collectionPeerJerseySchema.parse({
      id: row.id,
      ...side,
      seasonId: row.seasonId,
      type: row.type,
      seasonLabel: row.seasonLabel,
      ownerHandle: row.ownerHandle,
      ownerId: row.userId,
      ownerInitial: handleInitial(row.ownerHandle),
      biddingEnabled: row.biddingEnabled,
      latestBidAmountDkk: latestBid?.amount ?? null,
      photos,
    });
  }

  async listFavorites(userId: string, locale: LabelLocale = "da"): Promise<CollectionFavorites> {
    const rows = await this.db
      .select({
        userJerseyId: userJerseyFavorite.userJerseyId,
        clubId: userJersey.clubId,
        nationalTeamId: userJersey.nationalTeamId,
        type: userJersey.type,
        seasonLabel: season.label,
      })
      .from(userJerseyFavorite)
      .innerJoin(userJersey, eq(userJerseyFavorite.userJerseyId, userJersey.id))
      .innerJoin(season, eq(userJersey.seasonId, season.id))
      .where(and(eq(userJerseyFavorite.collectorId, userId), eq(userJersey.private, false)))
      .orderBy(desc(userJerseyFavorite.createdAt));

    if (rows.length === 0) {
      return collectionFavoritesSchema.parse({ favorites: [] });
    }

    const clubIds = uniqueNonNullIds(rows.map((row) => row.clubId));
    const nationalTeamIds = uniqueNonNullIds(rows.map((row) => row.nationalTeamId));
    const [clubLabels, nationalTeamLabels, photosByJersey] = await Promise.all([
      this.resolveEntityLabels("club", clubIds, locale),
      this.resolveEntityLabels("national_team", nationalTeamIds, locale),
      this.loadPhotosForJerseys(rows.map((row) => row.userJerseyId)),
    ]);

    const favorites = rows.flatMap((row) => {
      const side = discoverJerseySideFromLabels(row, clubLabels, nationalTeamLabels);
      const photos = photosByJersey.get(row.userJerseyId);
      if (!side || !photos || photos.length === 0) {
        return [];
      }

      return [
        {
          userJerseyId: row.userJerseyId,
          photoUrl: photos[0]?.photoUrl,
          clubLabel: side.clubLabel,
          seasonLabel: row.seasonLabel,
          type: row.type,
        },
      ];
    });

    return collectionFavoritesSchema.parse({ favorites });
  }

  async addFavorite(userId: string, rawBody: unknown): Promise<void> {
    const body = collectionAddFavoriteRequestSchema.parse(rawBody);

    const [jerseyRow] = await this.db
      .select({ ownerId: userJersey.userId })
      .from(userJersey)
      .where(eq(userJersey.id, body.userJerseyId))
      .limit(1);

    if (!jerseyRow) {
      throw new NotFoundException("UserJersey not found");
    }

    if (jerseyRow.ownerId === userId) {
      throw new ForbiddenException("Cannot favorite your own UserJersey");
    }

    await this.db
      .insert(userJerseyFavorite)
      .values({
        collectorId: userId,
        userJerseyId: body.userJerseyId,
      })
      .onConflictDoNothing({
        target: [userJerseyFavorite.collectorId, userJerseyFavorite.userJerseyId],
      });
  }

  async removeFavorite(userId: string, userJerseyId: string): Promise<void> {
    const deleted = await this.db
      .delete(userJerseyFavorite)
      .where(
        and(
          eq(userJerseyFavorite.collectorId, userId),
          eq(userJerseyFavorite.userJerseyId, userJerseyId),
        ),
      )
      .returning({ id: userJerseyFavorite.id });

    if (deleted.length === 0) {
      throw new NotFoundException("Favorite not found");
    }
  }

  async sendBid(
    userId: string,
    jerseyId: string,
    rawBody: unknown,
  ): Promise<CollectionSendBidResponse> {
    const body = collectionSendBidRequestSchema.parse(rawBody);

    const [jerseyRow] = await this.db
      .select({
        id: userJersey.id,
        ownerId: userJersey.userId,
        biddingEnabled: userJersey.biddingEnabled,
      })
      .from(userJersey)
      .where(eq(userJersey.id, jerseyId))
      .limit(1);

    if (!jerseyRow) {
      throw new NotFoundException("UserJersey not found");
    }

    if (jerseyRow.ownerId === userId) {
      throw new ForbiddenException("Cannot bid on your own UserJersey");
    }

    if (!jerseyRow.biddingEnabled) {
      throw new BadRequestException("Bidding is not enabled for this UserJersey");
    }

    if (await this.moderationService.isBlocked(userId, jerseyRow.ownerId)) {
      throw new ForbiddenException("Cannot start a conversation with this collector");
    }

    const [lowerCollectorId, upperCollectorId] = canonicalCollectorPair(userId, jerseyRow.ownerId);

    let conversationId: string;
    const [existingConversation] = await this.db
      .select({ id: conversation.id })
      .from(conversation)
      .where(
        and(
          eq(conversation.userJerseyId, jerseyId),
          eq(conversation.lowerCollectorId, lowerCollectorId),
          eq(conversation.upperCollectorId, upperCollectorId),
        ),
      )
      .limit(1);

    if (existingConversation) {
      conversationId = existingConversation.id;
    } else {
      const [insertedConversation] = await this.db
        .insert(conversation)
        .values({
          userJerseyId: jerseyId,
          lowerCollectorId,
          upperCollectorId,
        })
        .returning({ id: conversation.id });

      if (!insertedConversation) {
        throw new BadRequestException("Could not create conversation");
      }

      conversationId = insertedConversation.id;

      await this.db.insert(conversationParticipant).values([
        { conversationId, userId: jerseyRow.ownerId },
        { conversationId, userId },
      ]);
    }

    const [insertedMessage] = await this.db
      .insert(conversationMessage)
      .values({
        conversationId,
        senderId: userId,
        kind: "bid",
        bidAmountDkk: body.amountDkk,
        bidStatus: "pending",
      })
      .returning({ id: conversationMessage.id });

    if (!insertedMessage) {
      throw new BadRequestException("Could not create bid message");
    }

    await this.db
      .update(conversation)
      .set({ updatedAt: new Date() })
      .where(eq(conversation.id, conversationId));

    return collectionSendBidResponseSchema.parse({
      conversationId,
      messageId: insertedMessage.id,
    });
  }

  async respondBid(
    userId: string,
    conversationId: string,
    messageId: string,
    rawBody: unknown,
  ): Promise<CollectionRespondBidResponse> {
    await this.assertConversationParticipant(userId, conversationId);
    await this.assertConversationNotBlocked(userId, conversationId);
    const body = collectionRespondBidRequestSchema.parse(rawBody);

    const [context] = await this.db
      .select({
        ownerId: userJersey.userId,
      })
      .from(conversation)
      .innerJoin(userJersey, eq(conversation.userJerseyId, userJersey.id))
      .where(eq(conversation.id, conversationId))
      .limit(1);

    if (!context) {
      throw new NotFoundException("Conversation not found");
    }

    if (context.ownerId !== userId) {
      throw new ForbiddenException("Only the UserJersey owner can accept or decline bids");
    }

    const [messageRow] = await this.db
      .select({
        kind: conversationMessage.kind,
        bidStatus: conversationMessage.bidStatus,
        senderId: conversationMessage.senderId,
      })
      .from(conversationMessage)
      .where(
        and(
          eq(conversationMessage.id, messageId),
          eq(conversationMessage.conversationId, conversationId),
        ),
      )
      .limit(1);

    if (messageRow?.kind !== "bid") {
      throw new NotFoundException("Bid message not found");
    }

    if (messageRow.senderId === userId) {
      throw new ForbiddenException("Cannot respond to your own bid");
    }

    if (messageRow.bidStatus !== "pending") {
      throw new BadRequestException("Bid is not pending");
    }

    const bidStatus = body.decision === "accept" ? "accepted" : "declined";

    await this.db
      .update(conversationMessage)
      .set({ bidStatus })
      .where(eq(conversationMessage.id, messageId));

    await this.db
      .update(conversation)
      .set({ updatedAt: new Date() })
      .where(eq(conversation.id, conversationId));

    return collectionRespondBidResponseSchema.parse({ bidStatus });
  }

  async saveJersey(
    userId: string,
    rawBody: unknown,
    _locale: LabelLocale = "da",
  ): Promise<CollectionSaveResponse> {
    const parsed = collectionSaveRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const body = parsed.data;

    const photoValidationError = validateJerseyPhotos(body.photos);
    if (photoValidationError) {
      throw new BadRequestException({ code: photoValidationError });
    }

    if (body.draftId) {
      const existing = await this.findJerseyByDraft(userId, body.draftId);
      if (existing) {
        return collectionSaveResponseSchema.parse({ jersey: existing });
      }
    }

    const side = await resolveCatalogJerseySide(this.db, {
      clubId: body.clubId,
      nationalTeamId: body.nationalTeamId,
    });
    await assertSeasonLinkedToSide(this.db, side, body.seasonId);

    await this.assertOptionalPlayerScoped(side, body.seasonId, body.playerId);
    await this.assertOptionalPatchesScoped(body.seasonId, body.patchIds);

    const [insertedJersey] = await this.db
      .insert(userJersey)
      .values({
        userId,
        clubId: side.clubId,
        nationalTeamId: side.nationalTeamId,
        seasonId: body.seasonId,
        playerId: body.playerId ?? null,
        catalogKitId: body.catalogKitId ?? null,
        type: body.type,
        size: body.size,
        condition: body.condition,
        draftId: body.draftId ?? null,
      })
      .returning({
        id: userJersey.id,
        clubId: userJersey.clubId,
        nationalTeamId: userJersey.nationalTeamId,
        seasonId: userJersey.seasonId,
        catalogKitId: userJersey.catalogKitId,
        type: userJersey.type,
        size: userJersey.size,
        condition: userJersey.condition,
      });

    if (!insertedJersey) {
      throw new BadRequestException("Could not create UserJersey");
    }

    if (body.patchIds?.length) {
      await this.db.insert(userJerseyPatch).values(
        body.patchIds.map((patchId) => ({
          userJerseyId: insertedJersey.id,
          patchId,
        })),
      );
    }

    await this.persistPhotos(userId, insertedJersey.id, body.photos);

    const firstPhoto = body.photos[0];
    let effectiveVisionJobId = body.visionJobId ?? null;
    const shouldEnqueueVision =
      firstPhoto &&
      !effectiveVisionJobId &&
      !(body.draftId && (await this.visionService.findActiveJobForDraft(userId, body.draftId)));

    if (shouldEnqueueVision) {
      const firstPhotoBytes = decodeBase64Photo(firstPhoto.contentBase64);
      effectiveVisionJobId = await this.visionQueueService.enqueueFromSave(
        userId,
        firstPhotoBytes,
        body.draftId,
      );
    }

    if (effectiveVisionJobId) {
      await this.visionService.reconcileUserActionAtSave(
        userId,
        effectiveVisionJobId,
        insertedJersey.id,
        body.clubId,
        body.nationalTeamId,
        body.seasonId,
        body.type,
      );
    }

    if (body.draftId) {
      await this.db
        .insert(jerseyDraft)
        .values({
          id: body.draftId,
          userId,
          userJerseyId: insertedJersey.id,
        })
        .onConflictDoUpdate({
          target: jerseyDraft.id,
          set: {
            userJerseyId: insertedJersey.id,
            updatedAt: new Date(),
          },
        });
    }

    this.matchQueueService.enqueueFromSave(insertedJersey.id, userId);

    return collectionSaveResponseSchema.parse({
      jersey: await this.loadOwnJerseyOrThrow(userId, insertedJersey.id),
      visionJobId: effectiveVisionJobId ?? undefined,
    });
  }

  async getShowcasePhotoBytes(
    photoId: string,
    variant?: CollectionPhotoVariantQuery,
  ): Promise<Uint8Array> {
    const [row] = await this.db
      .select({
        objectKey: userJerseyPhoto.objectKey,
        private: userJersey.private,
        jerseyUserId: userJersey.userId,
      })
      .from(userJerseyPhoto)
      .innerJoin(userJersey, eq(userJerseyPhoto.userJerseyId, userJersey.id))
      .where(eq(userJerseyPhoto.id, photoId))
      .limit(1);

    if (!row || row.private) {
      throw new NotFoundException("Photo not found");
    }

    if (!row.objectKey.startsWith(`user/${row.jerseyUserId}/`)) {
      throw new NotFoundException("Photo not found");
    }

    const bytes = await resolveStoredPhotoBytes(this.objectStore, row.objectKey, variant);
    if (!bytes) {
      throw new NotFoundException("Photo bytes missing");
    }

    return bytes;
  }

  async uploadPhotoOriginal(userId: string, photoId: string, rawBody: unknown): Promise<void> {
    const body = collectionPhotoOriginalUploadSchema.parse(rawBody);

    const [row] = await this.db
      .select({
        objectKey: userJerseyPhoto.objectKey,
        role: userJerseyPhoto.role,
        jerseyUserId: userJersey.userId,
        jerseyId: userJersey.id,
      })
      .from(userJerseyPhoto)
      .innerJoin(userJersey, eq(userJerseyPhoto.userJerseyId, userJersey.id))
      .where(eq(userJerseyPhoto.id, photoId))
      .limit(1);

    if (!row || row.jerseyUserId !== userId) {
      throw new NotFoundException("Photo not found");
    }

    const bytes = decodeBase64Photo(body.contentBase64, maxOriginalPhotoBytesForRole(row.role));

    const prefix = photoPrefixFromStoredObjectKey(row.objectKey);
    if (!prefix) {
      throw new InternalServerErrorException("Invalid photo object key");
    }

    const keys = derivativeKeysForPhoto(userId, row.jerseyId, photoId);
    await storeGpsStrippedOriginal(this.objectStore, keys.original, bytes);

    this.photoDerivativeQueueService.enqueue(this.objectStore, {
      userId,
      jerseyId: row.jerseyId,
      photoId,
      role: row.role,
      sourceObjectKey: keys.original,
    });
  }

  async getPhotoBytes(
    userId: string,
    photoId: string,
    variant?: CollectionPhotoVariantQuery,
  ): Promise<Uint8Array> {
    const [row] = await this.db
      .select({
        objectKey: userJerseyPhoto.objectKey,
        jerseyUserId: userJersey.userId,
        jerseyId: userJersey.id,
        biddingEnabled: userJersey.biddingEnabled,
        private: userJersey.private,
      })
      .from(userJerseyPhoto)
      .innerJoin(userJersey, eq(userJerseyPhoto.userJerseyId, userJersey.id))
      .where(eq(userJerseyPhoto.id, photoId))
      .limit(1);

    if (!row) {
      throw new NotFoundException("Photo not found");
    }

    const isOwner = row.jerseyUserId === userId;
    if (!isOwner && row.private) {
      throw new NotFoundException("Photo not found");
    }

    const isPeerBidTarget = !isOwner && row.biddingEnabled;
    let isFavoriteCollector = false;

    if (!isOwner && !isPeerBidTarget) {
      const [favorite] = await this.db
        .select({ id: userJerseyFavorite.id })
        .from(userJerseyFavorite)
        .where(
          and(
            eq(userJerseyFavorite.collectorId, userId),
            eq(userJerseyFavorite.userJerseyId, row.jerseyId),
          ),
        )
        .limit(1);
      isFavoriteCollector = Boolean(favorite);
    }

    if (!isOwner && !isPeerBidTarget && !isFavoriteCollector) {
      throw new NotFoundException("Photo not found");
    }

    if (isOwner && !row.objectKey.startsWith(`user/${userId}/`)) {
      throw new NotFoundException("Photo not found");
    }

    if (
      (isPeerBidTarget || isFavoriteCollector) &&
      !row.objectKey.startsWith(`user/${row.jerseyUserId}/`)
    ) {
      throw new NotFoundException("Photo not found");
    }

    const bytes = await resolveStoredPhotoBytes(this.objectStore, row.objectKey, variant);
    if (!bytes) {
      throw new NotFoundException("Photo bytes missing");
    }

    return bytes;
  }

  private async findJerseyByDraft(
    userId: string,
    draftId: string,
  ): Promise<CollectionJersey | null> {
    const [draft] = await this.db
      .select({
        userJerseyId: jerseyDraft.userJerseyId,
      })
      .from(jerseyDraft)
      .where(and(eq(jerseyDraft.id, draftId), eq(jerseyDraft.userId, userId)))
      .limit(1);

    if (!draft?.userJerseyId) {
      return null;
    }

    const jerseys = await this.listJerseys(userId);
    return (
      jerseys.jerseys.find((jersey: CollectionJersey) => jersey.id === draft.userJerseyId) ?? null
    );
  }

  private async resolveCatalogDrillTitle(
    kind: "club" | "national_team" | "player" | "kit",
    entityId: string,
    locale: LabelLocale,
  ): Promise<string | undefined> {
    if (kind === "club") {
      const [clubRow] = await this.db
        .select({ id: club.id })
        .from(club)
        .where(eq(club.id, entityId))
        .limit(1);
      if (!clubRow) {
        return undefined;
      }
      return (await this.resolveEntityLabels("club", [entityId], locale)).get(entityId);
    }

    if (kind === "national_team") {
      const [nationalTeamRow] = await this.db
        .select({ id: nationalTeam.id })
        .from(nationalTeam)
        .where(eq(nationalTeam.id, entityId))
        .limit(1);
      if (!nationalTeamRow) {
        return undefined;
      }
      return (await this.resolveEntityLabels("national_team", [entityId], locale)).get(entityId);
    }

    if (kind === "player") {
      const [playerRow] = await this.db
        .select({ id: player.id })
        .from(player)
        .where(eq(player.id, entityId))
        .limit(1);
      if (!playerRow) {
        return undefined;
      }
      return (await this.resolveEntityLabels("player", [entityId], locale)).get(entityId);
    }

    const [kitRow] = await this.db
      .select({
        id: kit.id,
        clubId: kit.clubId,
        nationalTeamId: kit.nationalTeamId,
        type: kit.type,
        seasonLabel: season.label,
      })
      .from(kit)
      .innerJoin(season, eq(kit.seasonId, season.id))
      .where(eq(kit.id, entityId))
      .limit(1);
    if (!kitRow) {
      return undefined;
    }
    const sideLabel = kitRow.clubId
      ? (await this.resolveEntityLabels("club", [kitRow.clubId], locale)).get(kitRow.clubId)
      : kitRow.nationalTeamId
        ? (await this.resolveEntityLabels("national_team", [kitRow.nationalTeamId], locale)).get(
            kitRow.nationalTeamId,
          )
        : undefined;
    if (!sideLabel) {
      return undefined;
    }
    return `${sideLabel} ${kitRow.seasonLabel} ${KIT_TYPE_LABELS_DA[kitRow.type]}`;
  }

  private async loadSideLabels(
    rows: Array<{ clubId: string | null; nationalTeamId?: string | null }>,
    locale: LabelLocale,
  ): Promise<{ clubLabels: Map<string, string>; nationalTeamLabels: Map<string, string> }> {
    const [clubLabels, nationalTeamLabels] = await Promise.all([
      this.resolveEntityLabels("club", uniqueNonNullIds(rows.map((row) => row.clubId)), locale),
      this.resolveEntityLabels(
        "national_team",
        uniqueNonNullIds(rows.map((row) => row.nationalTeamId)),
        locale,
      ),
    ]);
    return { clubLabels, nationalTeamLabels };
  }

  private async resolveEntityLabels(
    entityType: "country" | "league" | "club" | "national_team" | "player" | "patch",
    entityIds: string[],
    locale: LabelLocale,
  ): Promise<Map<string, string>> {
    if (entityIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .select({
        entityId: catalogLabel.entityId,
        label: catalogLabel.text,
        locale: catalogLabel.locale,
        kind: catalogLabel.kind,
      })
      .from(catalogLabel)
      .where(
        and(eq(catalogLabel.entityType, entityType), inArray(catalogLabel.entityId, entityIds)),
      );

    const labels = new Map<string, string>();

    for (const entityId of entityIds) {
      const entityLabels = rows.filter((row) => row.entityId === entityId && row.label);
      const resolved =
        entityLabels.find((row) => row.locale === locale && row.kind === "label")?.label ??
        entityLabels.find((row) => row.locale === "mul" && row.kind === "label")?.label ??
        entityLabels.find((row) => row.locale === "en" && row.kind === "label")?.label;

      if (resolved) {
        labels.set(entityId, resolved);
      }
    }

    return labels;
  }

  private async resolveEntitySearchTexts(
    entityType: "country" | "league" | "club" | "national_team" | "player",
    entityIds: string[],
  ): Promise<Map<string, string[]>> {
    if (entityIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .select({
        entityId: catalogLabel.entityId,
        text: catalogLabel.text,
      })
      .from(catalogLabel)
      .where(
        and(eq(catalogLabel.entityType, entityType), inArray(catalogLabel.entityId, entityIds)),
      );

    const texts = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.text) {
        continue;
      }
      const existing = texts.get(row.entityId) ?? [];
      existing.push(row.text);
      texts.set(row.entityId, existing);
    }

    return texts;
  }

  private async loadSquadPlayersForScopes(
    scopes: Array<
      | { kind: "club"; clubId: string; seasonId: string }
      | { kind: "national_team"; nationalTeamId: string; seasonId: string }
    >,
    locale: LabelLocale,
  ): Promise<Map<string, CollectionJersey["squadPlayers"]>> {
    const playersByScope = new Map<string, CollectionJersey["squadPlayers"]>();

    if (scopes.length === 0) {
      return playersByScope;
    }

    const clubScopes = scopes.filter(
      (scope): scope is { kind: "club"; clubId: string; seasonId: string } => scope.kind === "club",
    );
    const nationalTeamScopes = scopes.filter(
      (scope): scope is { kind: "national_team"; nationalTeamId: string; seasonId: string } =>
        scope.kind === "national_team",
    );

    const resolvePlayers = (
      scopeRows: Array<{
        playerId: string;
        label: string | null;
        labelLocale: string | null;
        labelKind: string | null;
      }>,
    ): CollectionJersey["squadPlayers"] => {
      const playerIds = [...new Set(scopeRows.map((row) => row.playerId))];
      const squadPlayers: CollectionJersey["squadPlayers"] = [];
      for (const playerId of playerIds) {
        const playerLabels = scopeRows.filter((row) => row.playerId === playerId && row.label);
        const resolved =
          playerLabels.find((row) => row.labelLocale === locale && row.labelKind === "label")
            ?.label ??
          playerLabels.find((row) => row.labelLocale === "mul" && row.labelKind === "label")
            ?.label ??
          playerLabels.find((row) => row.labelLocale === "en" && row.labelKind === "label")?.label;
        if (resolved) {
          squadPlayers.push({ id: playerId, label: resolved });
        }
      }
      squadPlayers.sort((left, right) => left.label.localeCompare(right.label, "da"));
      return squadPlayers;
    };

    if (clubScopes.length > 0) {
      const scopeConditions = clubScopes.map((scope) =>
        and(
          eq(playerClubSeason.clubId, scope.clubId),
          eq(playerClubSeason.seasonId, scope.seasonId),
        ),
      );
      const rows = await this.db
        .select({
          playerId: playerClubSeason.playerId,
          clubId: playerClubSeason.clubId,
          seasonId: playerClubSeason.seasonId,
          label: catalogLabel.text,
          labelLocale: catalogLabel.locale,
          labelKind: catalogLabel.kind,
        })
        .from(playerClubSeason)
        .leftJoin(
          catalogLabel,
          and(
            eq(catalogLabel.entityType, "player"),
            eq(catalogLabel.entityId, playerClubSeason.playerId),
          ),
        )
        .where(scopeConditions.length === 1 ? scopeConditions[0]! : or(...scopeConditions));

      for (const scope of clubScopes) {
        playersByScope.set(
          `club:${scope.clubId}:${scope.seasonId}`,
          resolvePlayers(
            rows.filter((row) => row.clubId === scope.clubId && row.seasonId === scope.seasonId),
          ),
        );
      }
    }

    if (nationalTeamScopes.length > 0) {
      const scopeConditions = nationalTeamScopes.map((scope) =>
        and(
          eq(playerNationalTeamSeason.nationalTeamId, scope.nationalTeamId),
          eq(playerNationalTeamSeason.seasonId, scope.seasonId),
        ),
      );
      const rows = await this.db
        .select({
          playerId: playerNationalTeamSeason.playerId,
          nationalTeamId: playerNationalTeamSeason.nationalTeamId,
          seasonId: playerNationalTeamSeason.seasonId,
          label: catalogLabel.text,
          labelLocale: catalogLabel.locale,
          labelKind: catalogLabel.kind,
        })
        .from(playerNationalTeamSeason)
        .leftJoin(
          catalogLabel,
          and(
            eq(catalogLabel.entityType, "player"),
            eq(catalogLabel.entityId, playerNationalTeamSeason.playerId),
          ),
        )
        .where(scopeConditions.length === 1 ? scopeConditions[0]! : or(...scopeConditions));

      for (const scope of nationalTeamScopes) {
        playersByScope.set(
          `nt:${scope.nationalTeamId}:${scope.seasonId}`,
          resolvePlayers(
            rows.filter(
              (row) =>
                row.nationalTeamId === scope.nationalTeamId && row.seasonId === scope.seasonId,
            ),
          ),
        );
      }
    }

    return playersByScope;
  }

  private async decorateDiscoverJerseys(
    rows: Array<{
      id: string;
      clubId: string | null;
      nationalTeamId: string | null;
      seasonId: string;
      type: CollectionDiscoverJerseys["jerseys"][number]["type"];
      seasonLabel: string;
      ownerHandle: string;
    }>,
    locale: LabelLocale,
  ) {
    const clubIds = uniqueNonNullIds(rows.map((row) => row.clubId));
    const nationalTeamIds = uniqueNonNullIds(rows.map((row) => row.nationalTeamId));
    const [clubLabels, nationalTeamLabels, photosByJersey] = await Promise.all([
      this.resolveEntityLabels("club", clubIds, locale),
      this.resolveEntityLabels("national_team", nationalTeamIds, locale),
      this.loadPhotosForJerseys(rows.map((row) => row.id)),
    ]);

    return rows.flatMap((row) => {
      const side = discoverJerseySideFromLabels(row, clubLabels, nationalTeamLabels);
      const photos = photosByJersey.get(row.id);
      if (!side || !photos || photos.length === 0) {
        return [];
      }
      return [
        {
          id: row.id,
          ...side,
          seasonId: row.seasonId,
          type: row.type,
          seasonLabel: row.seasonLabel,
          ownerHandle: row.ownerHandle,
          photos,
        },
      ];
    });
  }

  private async loadPhotosForJerseys(
    jerseyIds: string[],
    photoUrlScope: "collection" | "showcase" = "collection",
  ) {
    const photosByJersey = new Map<string, CollectionJersey["photos"]>();

    if (jerseyIds.length === 0) {
      return photosByJersey;
    }

    const photoRows = await this.db
      .select({
        id: userJerseyPhoto.id,
        userJerseyId: userJerseyPhoto.userJerseyId,
        objectKey: userJerseyPhoto.objectKey,
        role: userJerseyPhoto.role,
        source: userJerseyPhoto.source,
        label: userJerseyPhoto.label,
        ocrStatus: userJerseyPhoto.ocrStatus,
      })
      .from(userJerseyPhoto)
      .where(inArray(userJerseyPhoto.userJerseyId, jerseyIds))
      .orderBy(asc(userJerseyPhoto.createdAt));

    for (const row of photoRows) {
      if (!row.objectKey.startsWith("user/")) {
        continue;
      }

      const photo = {
        id: row.id,
        role: row.role,
        source: row.source,
        objectKey: row.objectKey,
        photoUrl:
          photoUrlScope === "showcase"
            ? `/v1/collection/showcase/photos/${row.id}`
            : `/v1/collection/photos/${row.id}`,
        ocrStatus: row.ocrStatus,
        ...(row.label ? { label: row.label } : {}),
      };

      const existing = photosByJersey.get(row.userJerseyId) ?? [];
      existing.push(photo);
      photosByJersey.set(row.userJerseyId, existing);
    }

    return photosByJersey;
  }

  private async persistPhotos(
    userId: string,
    jerseyId: string,
    photos: CollectionSavePhoto[],
  ): Promise<CollectionJersey["photos"]> {
    const saved: CollectionJersey["photos"] = [];

    for (const photo of photos) {
      const bytes = decodeBase64Photo(photo.contentBase64, maxSavePhotoBytesForRole(photo.role));
      const photoId = crypto.randomUUID();
      const objectKey = gridObjectKeyForNewPhoto(userId, jerseyId, photoId);

      await this.objectStore.putObject(objectKey, bytes);

      const exists = await this.objectStore.objectExists(objectKey);
      if (!exists) {
        throw new BadRequestException(`Object store missing key after put: ${objectKey}`);
      }

      const [inserted] = await this.db
        .insert(userJerseyPhoto)
        .values({
          id: photoId,
          userJerseyId: jerseyId,
          objectKey,
          role: photo.role,
          source: photo.source,
          label: photo.role === "other" ? photo.label?.trim() || null : null,
          ocrStatus: "none",
        })
        .returning({
          id: userJerseyPhoto.id,
          role: userJerseyPhoto.role,
          source: userJerseyPhoto.source,
          objectKey: userJerseyPhoto.objectKey,
          label: userJerseyPhoto.label,
          ocrStatus: userJerseyPhoto.ocrStatus,
        });

      if (!inserted) {
        throw new BadRequestException("Could not persist photo row");
      }

      saved.push({
        id: inserted.id,
        role: inserted.role,
        source: inserted.source,
        objectKey: inserted.objectKey,
        photoUrl: `/v1/collection/photos/${inserted.id}`,
        ocrStatus: inserted.ocrStatus,
        ...(inserted.label ? { label: inserted.label } : {}),
      });

      this.photoDerivativeQueueService.enqueue(this.objectStore, {
        userId,
        jerseyId,
        photoId,
        role: photo.role,
        sourceObjectKey: objectKey,
      });
    }

    return saved;
  }

  private async assertOptionalPlayerScoped(
    side: Awaited<ReturnType<typeof resolveCatalogJerseySide>>,
    seasonId: string,
    playerId: string | null | undefined,
  ): Promise<void> {
    if (!playerId) {
      return;
    }

    const [playerRow] = await this.db
      .select({ id: player.id })
      .from(player)
      .where(eq(player.id, playerId))
      .limit(1);

    if (!playerRow) {
      throw new BadRequestException("playerId is not catalog truth");
    }

    if (side.kind === "club") {
      const [scopedRow] = await this.db
        .select({ id: playerClubSeason.id })
        .from(playerClubSeason)
        .where(
          and(
            eq(playerClubSeason.playerId, playerId),
            eq(playerClubSeason.clubId, side.clubId),
            eq(playerClubSeason.seasonId, seasonId),
          ),
        )
        .limit(1);

      if (!scopedRow) {
        throw new BadRequestException("playerId is not on this club season");
      }
      return;
    }

    const [scopedRow] = await this.db
      .select({ id: playerNationalTeamSeason.id })
      .from(playerNationalTeamSeason)
      .where(
        and(
          eq(playerNationalTeamSeason.playerId, playerId),
          eq(playerNationalTeamSeason.nationalTeamId, side.nationalTeamId),
          eq(playerNationalTeamSeason.seasonId, seasonId),
        ),
      )
      .limit(1);

    if (!scopedRow) {
      throw new BadRequestException("playerId is not on this national team season");
    }
  }

  private async assertOptionalPatchesScoped(
    seasonId: string,
    patchIds: string[] | undefined,
  ): Promise<void> {
    if (!patchIds?.length) {
      return;
    }

    const rows = await this.db
      .select({ id: patch.id })
      .from(patch)
      .where(and(inArray(patch.id, patchIds), eq(patch.seasonId, seasonId)));

    if (rows.length !== patchIds.length) {
      throw new BadRequestException("patchIds are not catalog truth for this season");
    }
  }

  private async loadPlayerFieldsForJerseys(
    rows: Array<{
      id: string;
      clubId: string | null;
      nationalTeamId?: string | null;
      seasonId: string;
      playerId: string | null;
    }>,
    locale: LabelLocale,
  ): Promise<Map<string, { label: string; number: string | null }>> {
    const playerIds = [
      ...new Set(rows.map((row) => row.playerId).filter((id): id is string => Boolean(id))),
    ];
    const fieldsByJersey = new Map<string, { label: string; number: string | null }>();

    if (playerIds.length === 0) {
      return fieldsByJersey;
    }

    const labels = await this.resolveEntityLabels("player", playerIds, locale);
    const [clubSquadRows, nationalTeamSquadRows] = await Promise.all([
      this.db
        .select({
          playerId: playerClubSeason.playerId,
          clubId: playerClubSeason.clubId,
          seasonId: playerClubSeason.seasonId,
          squadNumber: playerClubSeason.squadNumber,
        })
        .from(playerClubSeason)
        .where(inArray(playerClubSeason.playerId, playerIds)),
      this.db
        .select({
          playerId: playerNationalTeamSeason.playerId,
          nationalTeamId: playerNationalTeamSeason.nationalTeamId,
          seasonId: playerNationalTeamSeason.seasonId,
          squadNumber: playerNationalTeamSeason.squadNumber,
        })
        .from(playerNationalTeamSeason)
        .where(inArray(playerNationalTeamSeason.playerId, playerIds)),
    ]);

    for (const row of rows) {
      if (!row.playerId) {
        continue;
      }

      const label = labels.get(row.playerId);
      if (!label) {
        continue;
      }

      const squad = row.clubId
        ? clubSquadRows.find(
            (entry) =>
              entry.playerId === row.playerId &&
              entry.clubId === row.clubId &&
              entry.seasonId === row.seasonId,
          )
        : nationalTeamSquadRows.find(
            (entry) =>
              entry.playerId === row.playerId &&
              entry.nationalTeamId === row.nationalTeamId &&
              entry.seasonId === row.seasonId,
          );

      fieldsByJersey.set(row.id, {
        label,
        number: squad?.squadNumber ? String(squad.squadNumber) : null,
      });
    }

    return fieldsByJersey;
  }

  private async loadPatchesForJerseys(
    jerseyIds: string[],
    locale: LabelLocale,
  ): Promise<Map<string, NonNullable<CollectionJersey["patches"]>>> {
    const patchesByJersey = new Map<string, NonNullable<CollectionJersey["patches"]>>();

    if (jerseyIds.length === 0) {
      return patchesByJersey;
    }

    const rows = await this.db
      .select({
        userJerseyId: userJerseyPatch.userJerseyId,
        patchId: userJerseyPatch.patchId,
      })
      .from(userJerseyPatch)
      .where(inArray(userJerseyPatch.userJerseyId, jerseyIds));

    const patchIds = [...new Set(rows.map((row) => row.patchId))];
    const labels = await this.resolveEntityLabels("patch", patchIds, locale);

    for (const jerseyId of jerseyIds) {
      const jerseyPatches = rows
        .filter((row) => row.userJerseyId === jerseyId)
        .flatMap((row) => {
          const label = labels.get(row.patchId);
          return label ? [{ id: row.patchId, label }] : [];
        });
      patchesByJersey.set(jerseyId, jerseyPatches);
    }

    return patchesByJersey;
  }
}
