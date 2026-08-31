import type { Db } from "@kit/db";
import { userJersey, wishlistEntry } from "@kit/db";
import {
  findFirstWishlistMatch,
  type LabelLocale,
  type WishlistMatchCriteria,
  type WishlistMatchJersey,
} from "@kit/domain";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull, ne } from "drizzle-orm";
import { BillingService } from "../billing/billing.service.js";
import { DB } from "../db/db.module.js";

export const MATCH_QUEUE_NAME = "wishlist-match";

export type MatchJobPayload = {
  savedUserJerseyId: string;
  saverUserId: string;
};

@Injectable()
export class MatchService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly billingService: BillingService,
  ) {}

  async resolveMatchedJerseyId(
    wishlistOwnerUserId: string,
    criteria: WishlistMatchCriteria,
    entitlementLive: boolean,
  ): Promise<string | null> {
    if (!entitlementLive) {
      return null;
    }

    const candidates = await this.loadPeerMatchCandidates(wishlistOwnerUserId);
    return findFirstWishlistMatch(criteria, wishlistOwnerUserId, candidates);
  }

  async processSaveMatchJob(payload: MatchJobPayload): Promise<void> {
    const [savedJersey] = await this.db
      .select({
        id: userJersey.id,
        userId: userJersey.userId,
        clubId: userJersey.clubId,
        seasonId: userJersey.seasonId,
        type: userJersey.type,
        size: userJersey.size,
        biddingEnabled: userJersey.biddingEnabled,
        catalogKitId: userJersey.catalogKitId,
      })
      .from(userJersey)
      .where(eq(userJersey.id, payload.savedUserJerseyId))
      .limit(1);

    if (!savedJersey) {
      return;
    }

    const jersey: WishlistMatchJersey = {
      ownerUserId: savedJersey.userId,
      clubId: savedJersey.clubId,
      seasonId: savedJersey.seasonId,
      type: savedJersey.type,
      size: savedJersey.size,
      biddingEnabled: savedJersey.biddingEnabled,
      catalogKitId: savedJersey.catalogKitId,
    };

    const rows = await this.db
      .select({
        userId: wishlistEntry.userId,
        clubId: wishlistEntry.clubId,
        seasonId: wishlistEntry.seasonId,
        type: wishlistEntry.type,
        size: wishlistEntry.size,
      })
      .from(wishlistEntry)
      .where(ne(wishlistEntry.userId, payload.saverUserId));

    const ownersChecked = new Set<string>();

    for (const row of rows) {
      if (ownersChecked.has(row.userId)) {
        continue;
      }
      ownersChecked.add(row.userId);

      const entitlement = await this.billingService.getEntitlementForUser(row.userId);
      if (!entitlement.live) {
        continue;
      }

      const criteria: WishlistMatchCriteria = {
        clubId: row.clubId,
        seasonId: row.seasonId,
        type: row.type,
        size: row.size,
      };

      if (
        findFirstWishlistMatch(criteria, row.userId, [{ ...jersey, id: savedJersey.id }]) != null
      ) {
        // Match-push is a later Notify slice; compute-at-read serves list hits.
      }
    }
  }

  private async loadPeerMatchCandidates(
    wishlistOwnerUserId: string,
  ): Promise<Array<WishlistMatchJersey & { id: string }>> {
    const rows = await this.db
      .select({
        id: userJersey.id,
        userId: userJersey.userId,
        clubId: userJersey.clubId,
        seasonId: userJersey.seasonId,
        type: userJersey.type,
        size: userJersey.size,
        biddingEnabled: userJersey.biddingEnabled,
        catalogKitId: userJersey.catalogKitId,
      })
      .from(userJersey)
      .where(
        and(
          ne(userJersey.userId, wishlistOwnerUserId),
          eq(userJersey.biddingEnabled, true),
          isNull(userJersey.catalogKitId),
        ),
      );

    return rows.map((row) => ({
      id: row.id,
      ownerUserId: row.userId,
      clubId: row.clubId,
      seasonId: row.seasonId,
      type: row.type,
      size: row.size,
      biddingEnabled: row.biddingEnabled,
      catalogKitId: row.catalogKitId,
    }));
  }

  /** @internal test seam */
  async listPeerCandidatesForOwner(
    wishlistOwnerUserId: string,
    _locale: LabelLocale = "da",
  ): Promise<Array<WishlistMatchJersey & { id: string }>> {
    return this.loadPeerMatchCandidates(wishlistOwnerUserId);
  }
}
