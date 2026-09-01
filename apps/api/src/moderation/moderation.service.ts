import {
  type CollectionBlockConversationResponse,
  type CollectionReportConversationResponse,
  collectionBlockConversationResponseSchema,
  collectionReportConversationRequestSchema,
  collectionReportConversationResponseSchema,
} from "@kit/api-contract";
import type { Db } from "@kit/db";
import { conversation, moderationBlock, moderationReport, user } from "@kit/db";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, or } from "drizzle-orm";
import { DB } from "../db/db.module.js";

@Injectable()
export class ModerationService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async getBlockedPeerIds(userId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({
        blockerId: moderationBlock.blockerId,
        blockedId: moderationBlock.blockedId,
      })
      .from(moderationBlock)
      .where(or(eq(moderationBlock.blockerId, userId), eq(moderationBlock.blockedId, userId)));

    const blocked = new Set<string>();
    for (const row of rows) {
      if (row.blockerId === userId) {
        blocked.add(row.blockedId);
      } else {
        blocked.add(row.blockerId);
      }
    }
    return blocked;
  }

  async isBlocked(userId: string, peerId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: moderationBlock.id })
      .from(moderationBlock)
      .where(
        or(
          and(eq(moderationBlock.blockerId, userId), eq(moderationBlock.blockedId, peerId)),
          and(eq(moderationBlock.blockerId, peerId), eq(moderationBlock.blockedId, userId)),
        ),
      )
      .limit(1);

    return Boolean(row);
  }

  async blockConversationPeer(
    userId: string,
    conversationId: string,
  ): Promise<CollectionBlockConversationResponse> {
    const peerId = await this.resolveConversationPeerId(userId, conversationId);
    return this.blockPeer(userId, peerId);
  }

  async blockPeer(userId: string, peerId: string): Promise<CollectionBlockConversationResponse> {
    if (peerId === userId) {
      throw new BadRequestException("Cannot block yourself");
    }

    const [existing] = await this.db
      .select({ id: moderationBlock.id })
      .from(moderationBlock)
      .where(and(eq(moderationBlock.blockerId, userId), eq(moderationBlock.blockedId, peerId)))
      .limit(1);

    if (existing) {
      return collectionBlockConversationResponseSchema.parse({ blockId: existing.id });
    }

    const [inserted] = await this.db
      .insert(moderationBlock)
      .values({
        blockerId: userId,
        blockedId: peerId,
      })
      .returning({ id: moderationBlock.id });

    if (!inserted) {
      throw new BadRequestException("Could not create block");
    }

    return collectionBlockConversationResponseSchema.parse({ blockId: inserted.id });
  }

  async reportConversation(
    userId: string,
    conversationId: string,
    rawBody: unknown,
  ): Promise<CollectionReportConversationResponse> {
    const body = collectionReportConversationRequestSchema.parse(rawBody);
    const peerId = await this.resolveConversationPeerId(userId, conversationId);
    return this.reportPeer(userId, peerId, body, conversationId);
  }

  async reportPeer(
    userId: string,
    peerId: string,
    rawBody: unknown,
    conversationId?: string,
  ): Promise<CollectionReportConversationResponse> {
    const body = collectionReportConversationRequestSchema.parse(rawBody);

    if (peerId === userId) {
      throw new BadRequestException("Cannot report yourself");
    }

    const [peer] = await this.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, peerId))
      .limit(1);

    if (!peer) {
      throw new NotFoundException("Peer not found");
    }

    const [inserted] = await this.db
      .insert(moderationReport)
      .values({
        reporterId: userId,
        peerId,
        conversationId: conversationId ?? null,
        reason: body.reason?.trim() || null,
      })
      .returning({ id: moderationReport.id });

    if (!inserted) {
      throw new BadRequestException("Could not create report");
    }

    return collectionReportConversationResponseSchema.parse({ reportId: inserted.id });
  }

  private async resolveConversationPeerId(userId: string, conversationId: string): Promise<string> {
    const [row] = await this.db
      .select({
        lowerCollectorId: conversation.lowerCollectorId,
        upperCollectorId: conversation.upperCollectorId,
      })
      .from(conversation)
      .where(eq(conversation.id, conversationId))
      .limit(1);

    if (!row) {
      throw new NotFoundException("Conversation not found");
    }

    if (row.lowerCollectorId !== userId && row.upperCollectorId !== userId) {
      throw new NotFoundException("Conversation not found");
    }

    return row.lowerCollectorId === userId ? row.upperCollectorId : row.lowerCollectorId;
  }
}
