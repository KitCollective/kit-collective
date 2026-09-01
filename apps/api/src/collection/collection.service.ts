import {
  type CollectionActivity,
  type CollectionConversationDetail,
  type CollectionConversationPeer,
  type CollectionConversations,
  type CollectionDiscoverJerseys,
  type CollectionFavorites,
  type CollectionJersey,
  type CollectionJerseys,
  type CollectionPeerJersey,
  type CollectionRespondBidResponse,
  type CollectionSavePhoto,
  type CollectionSaveResponse,
  type CollectionSendBidResponse,
  type CollectionSendMessageResponse,
  collectionActivitySchema,
  collectionAddFavoriteRequestSchema,
  collectionBiddingPatchSchema,
  collectionConversationDetailSchema,
  collectionConversationPeerSchema,
  collectionConversationsSchema,
  collectionDiscoverJerseysSchema,
  collectionFavoritesSchema,
  collectionJerseysSchema,
  collectionPeerJerseySchema,
  collectionPrivatePatchSchema,
  collectionRespondBidRequestSchema,
  collectionRespondBidResponseSchema,
  collectionSaveRequestSchema,
  collectionSaveResponseSchema,
  collectionSendBidRequestSchema,
  collectionSendBidResponseSchema,
  collectionSendMessageRequestSchema,
  collectionSendMessageResponseSchema,
} from "@kit/api-contract";
import type { Db } from "@kit/db";
import {
  catalogLabel,
  club,
  conversation,
  conversationMessage,
  conversationParticipant,
  jerseyDraft,
  playerClubSeason,
  season,
  teamSeason,
  user,
  userJersey,
  userJerseyFavorite,
  userJerseyPhoto,
} from "@kit/db";
import type { LabelLocale } from "@kit/domain";
import { KIT_TYPE_LABELS_DA } from "@kit/domain";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, count, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { DB } from "../db/db.module.js";
import { MatchQueueService } from "../match/match-queue.service.js";
import { ModerationService } from "../moderation/moderation.service.js";
import { VisionService } from "../vision/vision.service.js";
import { VisionQueueService } from "../vision/vision-queue.service.js";
import { CollectionShortcutsService } from "./collection-shortcuts.service.js";
import { createMemoryObjectStore, type ObjectStoreAdapter } from "./object-store.js";
import { createR2ObjectStore } from "./r2-object-store.js";

export const OBJECT_STORE = Symbol("OBJECT_STORE");

function canonicalCollectorPair(leftId: string, rightId: string): [string, string] {
  return leftId < rightId ? [leftId, rightId] : [rightId, leftId];
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

function decodeBase64Photo(contentBase64: string): Uint8Array {
  const commaIndex = contentBase64.indexOf(",");
  const normalized = commaIndex >= 0 ? contentBase64.slice(commaIndex + 1) : contentBase64;
  const bytes = Buffer.from(normalized, "base64");
  if (bytes.length === 0) {
    throw new BadRequestException("Photo bytes are empty");
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
        seasonId: userJersey.seasonId,
        countryId: club.countryId,
        leagueId: season.leagueId,
        catalogKitId: userJersey.catalogKitId,
        type: userJersey.type,
        size: userJersey.size,
        condition: userJersey.condition,
        seasonLabel: season.label,
        biddingEnabled: userJersey.biddingEnabled,
        private: userJersey.private,
      })
      .from(userJersey)
      .innerJoin(season, eq(userJersey.seasonId, season.id))
      .innerJoin(club, eq(userJersey.clubId, club.id))
      .where(and(...filterConditions))
      .orderBy(desc(userJersey.createdAt));

    if (rows.length === 0) {
      return collectionJerseysSchema.parse({ jerseys: [] });
    }

    const clubIds = [...new Set(rows.map((row) => row.clubId))];
    const countryIds = [...new Set(rows.map((row) => row.countryId))];
    const leagueIds = [
      ...new Set(
        rows.map((row) => row.leagueId).filter((leagueId): leagueId is string => leagueId !== null),
      ),
    ];
    const jerseyIds = rows.map((row) => row.id);
    const squadScopeKeys = rows.map((row) => `${row.clubId}:${row.seasonId}`);
    const uniqueSquadScopes = [...new Set(squadScopeKeys)];

    const [clubLabels, countryLabels, leagueLabels, photosByJersey, squadPlayersByScope] =
      await Promise.all([
        this.resolveEntityLabels("club", clubIds, locale),
        this.resolveEntityLabels("country", countryIds, locale),
        this.resolveEntityLabels("league", leagueIds, locale),
        this.loadPhotosForJerseys(jerseyIds),
        this.loadSquadPlayersForScopes(
          uniqueSquadScopes.map((key) => {
            const [clubId, seasonId] = key.split(":");
            return { clubId: clubId!, seasonId: seasonId! };
          }),
          locale,
        ),
      ]);

    const jerseys: CollectionJersey[] = rows.map((row) => {
      const clubLabel = clubLabels.get(row.clubId);
      if (!clubLabel) {
        throw new NotFoundException(`Club label missing for jersey ${row.id}`);
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

      return {
        id: row.id,
        clubId: row.clubId,
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
        seasonLabel: row.seasonLabel,
        squadPlayers: squadPlayersByScope.get(`${row.clubId}:${row.seasonId}`) ?? [],
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
        Boolean(latest) &&
        latest!.senderId !== userId &&
        (!lastReadAt || latest!.createdAt > lastReadAt);

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

    const clubIds = [...new Set(visibleBidRows.map((row) => row.clubId))];
    const clubLabels = await this.resolveEntityLabels("club", clubIds, locale);

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

      const clubLabel = clubLabels.get(row.clubId);
      if (!clubLabel) {
        throw new NotFoundException("Club label missing for activity");
      }

      const fromHandle = senderById.get(row.senderId);
      if (!fromHandle) {
        throw new NotFoundException("Sender handle missing for activity");
      }

      const viewerIsOwner = row.ownerId === userId;
      const kitLine = `${clubLabel} · ${row.seasonLabel} · ${KIT_TYPE_LABELS_DA[row.type]}`;

      const latest = latestByConversation.get(row.conversationId);
      const lastReadAt = lastReadByConversation.get(row.conversationId);
      const unread =
        Boolean(latest) &&
        latest!.senderId !== userId &&
        (!lastReadAt || latest!.createdAt > lastReadAt);

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
        type: userJersey.type,
        seasonLabel: season.label,
      })
      .from(userJersey)
      .innerJoin(season, eq(userJersey.seasonId, season.id))
      .where(eq(userJersey.id, conversationRow.userJerseyId))
      .limit(1);

    let jerseyContext: CollectionConversationDetail["jerseyContext"];
    if (jerseyRow) {
      const clubLabels = await this.resolveEntityLabels("club", [jerseyRow.clubId], locale);
      const clubLabel = clubLabels.get(jerseyRow.clubId);
      if (clubLabel) {
        jerseyContext = {
          clubLabel,
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
        body: hasText ? body.text!.trim() : null,
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

    if (!row || row.kind !== "image" || !row.imageObjectKey) {
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
      .where(eq(userJersey.userId, peerId));

    return collectionConversationPeerSchema.parse({
      handle: peerRow.handle,
      jerseyCount: Number(jerseyCountRow?.count ?? 0),
      ...(peerRow.showCity && peerRow.city ? { city: peerRow.city } : {}),
    });
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
    const rows = await this.db
      .select({
        id: userJersey.id,
        clubId: userJersey.clubId,
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

    if (rows.length === 0) {
      return collectionDiscoverJerseysSchema.parse({ jerseys: [] });
    }

    const clubIds = [...new Set(rows.map((row) => row.clubId))];
    const clubLabels = await this.resolveEntityLabels("club", clubIds, locale);
    const normalizedQuery = query?.trim().toLowerCase() ?? "";

    const filteredRows = rows.filter((row) => {
      const clubLabel = clubLabels.get(row.clubId);
      if (!clubLabel) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      const haystack = `${clubLabel} ${row.seasonLabel}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });

    if (filteredRows.length === 0) {
      return collectionDiscoverJerseysSchema.parse({ jerseys: [] });
    }

    const photosByJersey = await this.loadPhotosForJerseys(filteredRows.map((row) => row.id));

    const jerseys = filteredRows.flatMap((row) => {
      const clubLabel = clubLabels.get(row.clubId);
      const photos = photosByJersey.get(row.id);
      if (!clubLabel || !photos || photos.length === 0) {
        return [];
      }

      return [
        {
          id: row.id,
          clubId: row.clubId,
          seasonId: row.seasonId,
          type: row.type,
          clubLabel,
          seasonLabel: row.seasonLabel,
          ownerHandle: row.ownerHandle,
          photos,
        },
      ];
    });

    return collectionDiscoverJerseysSchema.parse({ jerseys });
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

    // Own copies, private copies, and unknown ids are indistinguishable — no existence leak.
    if (!row || row.userId === userId || row.private) {
      throw new NotFoundException("UserJersey not found");
    }

    const clubLabels = await this.resolveEntityLabels("club", [row.clubId], locale);
    const clubLabel = clubLabels.get(row.clubId);
    if (!clubLabel) {
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
      clubId: row.clubId,
      seasonId: row.seasonId,
      type: row.type,
      clubLabel,
      seasonLabel: row.seasonLabel,
      ownerHandle: row.ownerHandle,
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

    const clubIds = [...new Set(rows.map((row) => row.clubId))];
    const clubLabels = await this.resolveEntityLabels("club", clubIds, locale);
    const photosByJersey = await this.loadPhotosForJerseys(rows.map((row) => row.userJerseyId));

    const favorites = rows.flatMap((row) => {
      const clubLabel = clubLabels.get(row.clubId);
      const photos = photosByJersey.get(row.userJerseyId);
      if (!clubLabel || !photos || photos.length === 0) {
        return [];
      }

      return [
        {
          userJerseyId: row.userJerseyId,
          photoUrl: photos[0]!.photoUrl,
          clubLabel,
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

    if (!messageRow || messageRow.kind !== "bid") {
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
    locale: LabelLocale = "da",
  ): Promise<CollectionSaveResponse> {
    const body = collectionSaveRequestSchema.parse(rawBody);

    if (body.draftId) {
      const existing = await this.findJerseyByDraft(userId, body.draftId);
      if (existing) {
        return collectionSaveResponseSchema.parse({ jersey: existing });
      }
    }

    const [clubRow] = await this.db
      .select({ id: club.id, countryId: club.countryId })
      .from(club)
      .where(eq(club.id, body.clubId))
      .limit(1);

    if (!clubRow) {
      throw new BadRequestException("clubId is not a catalog club");
    }

    const [seasonRow] = await this.db
      .select({ id: season.id, label: season.label, leagueId: season.leagueId })
      .from(season)
      .where(eq(season.id, body.seasonId))
      .limit(1);

    if (!seasonRow) {
      throw new BadRequestException("seasonId is not a catalog season");
    }

    const [teamSeasonRow] = await this.db
      .select({ id: teamSeason.id })
      .from(teamSeason)
      .where(and(eq(teamSeason.clubId, body.clubId), eq(teamSeason.seasonId, body.seasonId)))
      .limit(1);

    if (!teamSeasonRow) {
      throw new BadRequestException("clubId and seasonId are not linked in TeamSeason");
    }

    const clubLabels = await this.resolveEntityLabels("club", [body.clubId], locale);
    const clubLabel = clubLabels.get(body.clubId);
    if (!clubLabel) {
      throw new BadRequestException("clubId has no resolved label");
    }

    const countryLabels = await this.resolveEntityLabels("country", [clubRow.countryId], locale);
    const countryLabel = countryLabels.get(clubRow.countryId);
    if (!countryLabel) {
      throw new BadRequestException("clubId country has no resolved label");
    }

    const [insertedJersey] = await this.db
      .insert(userJersey)
      .values({
        userId,
        clubId: body.clubId,
        seasonId: body.seasonId,
        catalogKitId: body.catalogKitId ?? null,
        type: body.type,
        size: body.size,
        condition: body.condition,
        draftId: body.draftId ?? null,
      })
      .returning({
        id: userJersey.id,
        clubId: userJersey.clubId,
        seasonId: userJersey.seasonId,
        catalogKitId: userJersey.catalogKitId,
        type: userJersey.type,
        size: userJersey.size,
        condition: userJersey.condition,
      });

    if (!insertedJersey) {
      throw new BadRequestException("Could not create UserJersey");
    }

    const photos = await this.persistPhotos(userId, insertedJersey.id, body.photos);

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

    let leagueLabel: string | null = null;
    if (seasonRow.leagueId) {
      const leagueLabels = await this.resolveEntityLabels("league", [seasonRow.leagueId], locale);
      leagueLabel = leagueLabels.get(seasonRow.leagueId) ?? null;
      if (!leagueLabel) {
        throw new BadRequestException("seasonId league has no resolved label");
      }
    }

    const squadPlayersByScope = await this.loadSquadPlayersForScopes(
      [{ clubId: body.clubId, seasonId: body.seasonId }],
      locale,
    );

    const jersey: CollectionJersey = {
      id: insertedJersey.id,
      clubId: insertedJersey.clubId,
      seasonId: insertedJersey.seasonId,
      countryId: clubRow.countryId,
      leagueId: seasonRow.leagueId,
      catalogKitId: insertedJersey.catalogKitId,
      type: insertedJersey.type,
      size: insertedJersey.size,
      condition: insertedJersey.condition,
      countryLabel,
      leagueLabel,
      clubLabel,
      seasonLabel: seasonRow.label,
      squadPlayers: squadPlayersByScope.get(`${body.clubId}:${body.seasonId}`) ?? [],
      photos,
      biddingEnabled: false,
      private: false,
    };

    return collectionSaveResponseSchema.parse({
      jersey,
      visionJobId: effectiveVisionJobId ?? undefined,
    });
  }

  async getPhotoBytes(userId: string, photoId: string): Promise<Uint8Array> {
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

    const bytes = await this.objectStore.getObject(row.objectKey);
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

  private async resolveEntityLabels(
    entityType: "country" | "league" | "club",
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

  private async loadSquadPlayersForScopes(
    scopes: Array<{ clubId: string; seasonId: string }>,
    locale: LabelLocale,
  ): Promise<Map<string, CollectionJersey["squadPlayers"]>> {
    const playersByScope = new Map<string, CollectionJersey["squadPlayers"]>();

    if (scopes.length === 0) {
      return playersByScope;
    }

    const scopeConditions = scopes.map((scope) =>
      and(eq(playerClubSeason.clubId, scope.clubId), eq(playerClubSeason.seasonId, scope.seasonId)),
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

    for (const scope of scopes) {
      const scopeKey = `${scope.clubId}:${scope.seasonId}`;
      const scopeRows = rows.filter(
        (row) => row.clubId === scope.clubId && row.seasonId === scope.seasonId,
      );
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
      playersByScope.set(scopeKey, squadPlayers);
    }

    return playersByScope;
  }

  private async loadPhotosForJerseys(jerseyIds: string[]) {
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
        photoUrl: `/v1/collection/photos/${row.id}`,
        ocrStatus: row.ocrStatus,
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
      const bytes = decodeBase64Photo(photo.contentBase64);
      const photoId = crypto.randomUUID();
      const objectKey = `user/${userId}/${jerseyId}/${photoId}.jpg`;

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
          ocrStatus: "none",
        })
        .returning({
          id: userJerseyPhoto.id,
          role: userJerseyPhoto.role,
          source: userJerseyPhoto.source,
          objectKey: userJerseyPhoto.objectKey,
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
      });
    }

    return saved;
  }
}
