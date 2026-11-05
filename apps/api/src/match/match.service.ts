import type { WishlistMatch } from "@kit/api-contract";
import type { Db } from "@kit/db";
import {
  moderationBlock,
  user,
  userJersey,
  userJerseyPhoto,
  wishlistEntry,
  wishlistMatch,
} from "@kit/db";
import {
  isWishlistMatchCandidate,
  matchesWishlistFacets,
  type WishlistMatchJersey,
} from "@kit/domain";
import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, isNull, like, ne, or, sql } from "drizzle-orm";
import { BillingService } from "../billing/billing.service.js";
import { DB } from "../db/db.module.js";

export const MATCH_QUEUE_NAME = "wishlist-match";

export type MatchJobPayload = {
  savedUserJerseyId: string;
  saverUserId: string;
};

export type EntryMatches = {
  matches: WishlistMatch[];
  matchCount: number;
  unseenCount: number;
};

const jerseyColumns = {
  id: userJersey.id,
  userId: userJersey.userId,
  clubId: userJersey.clubId,
  nationalTeamId: userJersey.nationalTeamId,
  seasonId: userJersey.seasonId,
  type: userJersey.type,
  size: userJersey.size,
  biddingEnabled: userJersey.biddingEnabled,
  private: userJersey.private,
  catalogKitId: userJersey.catalogKitId,
};

type JerseyRow = {
  id: string;
  userId: string;
  clubId: string | null;
  nationalTeamId: string | null;
  seasonId: string;
  type: WishlistMatchJersey["type"];
  size: WishlistMatchJersey["size"];
  biddingEnabled: boolean;
  private: boolean;
  catalogKitId: string | null;
};

function toMatchJersey(row: JerseyRow): WishlistMatchJersey {
  return {
    ownerUserId: row.userId,
    clubId: row.clubId,
    nationalTeamId: row.nationalTeamId,
    seasonId: row.seasonId,
    type: row.type,
    size: row.size,
    biddingEnabled: row.biddingEnabled,
    private: row.private,
    catalogKitId: row.catalogKitId,
  };
}

@Injectable()
export class MatchService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly billingService: BillingService,
  ) {}

  /**
   * Brings the stored Matches of a Collector's wishes in line with the match rule: adds the pairs
   * that now match (found now, unseen) and removes the ones that no longer do (jersey closed for
   * bids, private, or either Collector blocking the other). Deleted jerseys and wishes are gone
   * through the foreign keys.
   */
  async syncMatchesForOwner(ownerUserId: string): Promise<void> {
    const wishes = await this.db
      .select({
        id: wishlistEntry.id,
        clubId: wishlistEntry.clubId,
        nationalTeamId: wishlistEntry.nationalTeamId,
        seasonId: wishlistEntry.seasonId,
        type: wishlistEntry.type,
        size: wishlistEntry.size,
      })
      .from(wishlistEntry)
      .where(eq(wishlistEntry.userId, ownerUserId));

    if (wishes.length === 0) {
      return;
    }

    const blockedPeers = await this.loadBlockedPeerIds(ownerUserId);
    const candidates = (
      await this.db
        .select(jerseyColumns)
        .from(userJersey)
        .where(
          and(
            ne(userJersey.userId, ownerUserId),
            eq(userJersey.biddingEnabled, true),
            eq(userJersey.private, false),
            isNull(userJersey.catalogKitId),
          ),
        )
    ).filter((row) => !blockedPeers.has(row.userId));

    const wanted = new Map<string, { wishlistEntryId: string; userJerseyId: string }>();
    for (const wish of wishes) {
      for (const row of candidates) {
        if (matchesWishlistFacets(wish, row)) {
          wanted.set(pairKey(wish.id, row.id), { wishlistEntryId: wish.id, userJerseyId: row.id });
        }
      }
    }

    const stored = await this.db
      .select({
        id: wishlistMatch.id,
        wishlistEntryId: wishlistMatch.wishlistEntryId,
        userJerseyId: wishlistMatch.userJerseyId,
      })
      .from(wishlistMatch)
      .where(
        inArray(
          wishlistMatch.wishlistEntryId,
          wishes.map((wish) => wish.id),
        ),
      );

    const storedKeys = new Set(stored.map((row) => pairKey(row.wishlistEntryId, row.userJerseyId)));
    const staleIds = stored
      .filter((row) => !wanted.has(pairKey(row.wishlistEntryId, row.userJerseyId)))
      .map((row) => row.id);
    const missing = [...wanted].filter(([key]) => !storedKeys.has(key)).map(([, pair]) => pair);

    if (staleIds.length > 0) {
      await this.db.delete(wishlistMatch).where(inArray(wishlistMatch.id, staleIds));
    }
    if (missing.length > 0) {
      await this.db.insert(wishlistMatch).values(missing).onConflictDoNothing();
    }
  }

  async deleteMatchesOfEntry(wishlistEntryId: string): Promise<void> {
    await this.db.delete(wishlistMatch).where(eq(wishlistMatch.wishlistEntryId, wishlistEntryId));
  }

  /** Per wish: the newest `cap` Matches with thumb and owner Handle, the total and the unseen count. */
  async loadMatchesForEntries(
    entryIds: string[],
    cap: number,
  ): Promise<{ byEntry: Map<string, EntryMatches>; returnedMatchIds: string[] }> {
    const byEntry = new Map<string, EntryMatches>();
    const returnedMatchIds: string[] = [];
    if (entryIds.length === 0) {
      return { byEntry, returnedMatchIds };
    }

    const rows = await this.db
      .select({
        id: wishlistMatch.id,
        wishlistEntryId: wishlistMatch.wishlistEntryId,
        jerseyId: wishlistMatch.userJerseyId,
        foundAt: wishlistMatch.foundAt,
        seen: wishlistMatch.seen,
        ownerHandle: user.handle,
      })
      .from(wishlistMatch)
      .innerJoin(userJersey, eq(userJersey.id, wishlistMatch.userJerseyId))
      .innerJoin(user, eq(user.id, userJersey.userId))
      .where(inArray(wishlistMatch.wishlistEntryId, entryIds))
      .orderBy(desc(wishlistMatch.foundAt), asc(wishlistMatch.id));

    const returned = new Map<string, typeof rows>();
    for (const row of rows) {
      const entry = byEntry.get(row.wishlistEntryId) ?? {
        matches: [],
        matchCount: 0,
        unseenCount: 0,
      };
      entry.matchCount += 1;
      if (!row.seen) {
        entry.unseenCount += 1;
      }
      byEntry.set(row.wishlistEntryId, entry);

      const kept = returned.get(row.wishlistEntryId) ?? [];
      if (kept.length < cap) {
        kept.push(row);
        returned.set(row.wishlistEntryId, kept);
      }
    }

    const thumbs = await this.loadThumbUrls(
      [...returned.values()].flat().map((row) => row.jerseyId),
    );
    for (const [entryId, kept] of returned) {
      const entry = byEntry.get(entryId);
      if (!entry) {
        continue;
      }
      entry.matches = kept.map((row) => ({
        jerseyId: row.jerseyId,
        thumbUrl: thumbs.get(row.jerseyId) ?? null,
        ownerHandle: row.ownerHandle,
        foundAt: row.foundAt.toISOString(),
        seen: row.seen,
      }));
      returnedMatchIds.push(...kept.map((row) => row.id));
    }

    return { byEntry, returnedMatchIds };
  }

  async markSeen(matchIds: string[]): Promise<void> {
    if (matchIds.length === 0) {
      return;
    }
    await this.db
      .update(wishlistMatch)
      .set({ seen: true })
      .where(inArray(wishlistMatch.id, matchIds));
  }

  async countUnseenForOwner(ownerUserId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(wishlistMatch)
      .innerJoin(wishlistEntry, eq(wishlistEntry.id, wishlistMatch.wishlistEntryId))
      .where(and(eq(wishlistEntry.userId, ownerUserId), eq(wishlistMatch.seen, false)));
    return row?.total ?? 0;
  }

  /** Stores the Matches of a freshly saved jersey, so each has the time it was found. */
  async processSaveMatchJob(payload: MatchJobPayload): Promise<void> {
    const [savedJersey] = await this.db
      .select(jerseyColumns)
      .from(userJersey)
      .where(eq(userJersey.id, payload.savedUserJerseyId))
      .limit(1);

    if (!savedJersey) {
      return;
    }

    const wishes = await this.db
      .select({
        id: wishlistEntry.id,
        userId: wishlistEntry.userId,
        clubId: wishlistEntry.clubId,
        nationalTeamId: wishlistEntry.nationalTeamId,
        seasonId: wishlistEntry.seasonId,
        type: wishlistEntry.type,
        size: wishlistEntry.size,
      })
      .from(wishlistEntry)
      .where(ne(wishlistEntry.userId, savedJersey.userId));

    const blockedPeers = await this.loadBlockedPeerIds(savedJersey.userId);
    const liveByOwner = new Map<string, boolean>();
    const missing: { wishlistEntryId: string; userJerseyId: string }[] = [];

    for (const wish of wishes) {
      if (
        blockedPeers.has(wish.userId) ||
        !isWishlistMatchCandidate(toMatchJersey(savedJersey), wish.userId) ||
        !matchesWishlistFacets(wish, savedJersey)
      ) {
        continue;
      }
      let live = liveByOwner.get(wish.userId);
      if (live === undefined) {
        live = (await this.billingService.getEntitlementForUser(wish.userId)).live;
        liveByOwner.set(wish.userId, live);
      }
      if (live) {
        missing.push({ wishlistEntryId: wish.id, userJerseyId: savedJersey.id });
      }
    }

    if (missing.length > 0) {
      await this.db.insert(wishlistMatch).values(missing).onConflictDoNothing();
    }
  }

  /** Collectors who blocked `userId`, or whom `userId` blocked. */
  private async loadBlockedPeerIds(userId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ blockerId: moderationBlock.blockerId, blockedId: moderationBlock.blockedId })
      .from(moderationBlock)
      .where(or(eq(moderationBlock.blockerId, userId), eq(moderationBlock.blockedId, userId)));

    return new Set(rows.map((row) => (row.blockerId === userId ? row.blockedId : row.blockerId)));
  }

  /** First Save photo of each jersey, as the showcase URL: it serves any non-private jersey. */
  private async loadThumbUrls(jerseyIds: string[]): Promise<Map<string, string>> {
    const thumbs = new Map<string, string>();
    if (jerseyIds.length === 0) {
      return thumbs;
    }

    const photos = await this.db
      .select({ id: userJerseyPhoto.id, userJerseyId: userJerseyPhoto.userJerseyId })
      .from(userJerseyPhoto)
      .where(
        and(
          inArray(userJerseyPhoto.userJerseyId, jerseyIds),
          like(userJerseyPhoto.objectKey, "user/%"),
        ),
      )
      .orderBy(asc(userJerseyPhoto.createdAt));

    for (const photo of photos) {
      if (!thumbs.has(photo.userJerseyId)) {
        thumbs.set(photo.userJerseyId, `/v1/collection/showcase/photos/${photo.id}`);
      }
    }
    return thumbs;
  }
}

function pairKey(wishlistEntryId: string, userJerseyId: string): string {
  return `${wishlistEntryId}:${userJerseyId}`;
}
