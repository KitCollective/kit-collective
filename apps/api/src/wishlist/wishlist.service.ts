import {
  WISHLIST_MATCH_CAP,
  type WishlistEntries,
  type WishlistEntry,
  type WishlistEntryWrite,
  type WishlistUnseenCount,
  wishlistEntriesSchema,
  wishlistEntrySchema,
  wishlistEntryWriteSchema,
  wishlistUnseenCountSchema,
} from "@kit/api-contract";
import type { Db } from "@kit/db";
import { catalogLabel, club, nationalTeam, season, wishlistEntry } from "@kit/db";
import {
  buildWishlistAndMeta,
  buildWishlistAutoName,
  type JerseySize,
  type KitType,
  type LabelLocale,
  resolveWishlistSizeLabel,
  resolveWishlistTypeLabel,
} from "@kit/domain";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, inArray } from "drizzle-orm";
import { BillingService } from "../billing/billing.service.js";
import { DB } from "../db/db.module.js";
import { type EntryMatches, MatchService } from "../match/match.service.js";

type WishlistRow = {
  id: string;
  userId: string;
  clubId: string | null;
  nationalTeamId: string | null;
  seasonId: string | null;
  type: KitType | null;
  size: JerseySize | null;
};

type WishlistCriteriaValues = Pick<
  WishlistRow,
  "clubId" | "nationalTeamId" | "seasonId" | "type" | "size"
>;

@Injectable()
export class WishlistService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly billingService: BillingService,
    private readonly matchService: MatchService,
  ) {}

  async listEntries(userId: string, locale: LabelLocale = "da"): Promise<WishlistEntries> {
    const entitlement = await this.billingService.getEntitlementForUser(userId);
    if (entitlement.live) {
      await this.matchService.syncMatchesForOwner(userId);
    }

    const rows = await this.db
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
      .where(eq(wishlistEntry.userId, userId))
      .orderBy(asc(wishlistEntry.createdAt));

    const { byEntry, returnedMatchIds } = entitlement.live
      ? await this.matchService.loadMatchesForEntries(
          rows.map((row) => row.id),
          WISHLIST_MATCH_CAP,
        )
      : { byEntry: new Map<string, EntryMatches>(), returnedMatchIds: [] };

    const entries: WishlistEntry[] = await Promise.all(
      rows.map((row) => this.toEntryResponse(row, locale, byEntry.get(row.id))),
    );

    const response = wishlistEntriesSchema.parse({
      entries,
      unseenCount: entitlement.live ? await this.matchService.countUnseenForOwner(userId) : 0,
    });

    // Seen only once the response is built, so this response still reports them as new.
    await this.matchService.markSeen(returnedMatchIds);

    return response;
  }

  async unseenMatchCount(userId: string): Promise<WishlistUnseenCount> {
    const entitlement = await this.billingService.getEntitlementForUser(userId);
    if (!entitlement.live) {
      return wishlistUnseenCountSchema.parse({ unseenCount: 0 });
    }

    await this.matchService.syncMatchesForOwner(userId);
    return wishlistUnseenCountSchema.parse({
      unseenCount: await this.matchService.countUnseenForOwner(userId),
    });
  }

  async createEntry(userId: string, rawBody: unknown, locale: LabelLocale): Promise<WishlistEntry> {
    const body = this.parseWrite(rawBody);
    await this.validateCatalogIds(body);

    const values = this.writeToValues(body);

    const [inserted] = await this.db
      .insert(wishlistEntry)
      .values({
        userId,
        clubId: values.clubId,
        nationalTeamId: values.nationalTeamId,
        seasonId: values.seasonId,
        type: values.type,
        size: values.size,
      })
      .returning({
        id: wishlistEntry.id,
        userId: wishlistEntry.userId,
        clubId: wishlistEntry.clubId,
        nationalTeamId: wishlistEntry.nationalTeamId,
        seasonId: wishlistEntry.seasonId,
        type: wishlistEntry.type,
        size: wishlistEntry.size,
      });

    if (!inserted) {
      throw new BadRequestException("Could not create wishlist entry");
    }

    return this.toEntryResponseWithMatches(inserted, locale);
  }

  async updateEntry(
    userId: string,
    entryId: string,
    rawBody: unknown,
    locale: LabelLocale,
  ): Promise<WishlistEntry> {
    await this.getOwnedEntryRow(userId, entryId);
    const body = this.parseWrite(rawBody);
    await this.validateCatalogIds(body);

    const values = this.writeToValues(body);
    await this.matchService.deleteMatchesOfEntry(entryId);

    const [updated] = await this.db
      .update(wishlistEntry)
      .set({
        clubId: values.clubId,
        nationalTeamId: values.nationalTeamId,
        seasonId: values.seasonId,
        type: values.type,
        size: values.size,
        updatedAt: new Date(),
      })
      .where(and(eq(wishlistEntry.id, entryId), eq(wishlistEntry.userId, userId)))
      .returning({
        id: wishlistEntry.id,
        userId: wishlistEntry.userId,
        clubId: wishlistEntry.clubId,
        nationalTeamId: wishlistEntry.nationalTeamId,
        seasonId: wishlistEntry.seasonId,
        type: wishlistEntry.type,
        size: wishlistEntry.size,
      });

    if (!updated) {
      throw new NotFoundException("Wishlist entry not found");
    }

    return this.toEntryResponseWithMatches(updated, locale);
  }

  async deleteEntry(userId: string, entryId: string): Promise<void> {
    await this.getOwnedEntryRow(userId, entryId);

    const [deleted] = await this.db
      .delete(wishlistEntry)
      .where(and(eq(wishlistEntry.id, entryId), eq(wishlistEntry.userId, userId)))
      .returning({ id: wishlistEntry.id });

    if (!deleted) {
      throw new NotFoundException("Wishlist entry not found");
    }
  }

  private parseWrite(rawBody: unknown): WishlistEntryWrite {
    const result = wishlistEntryWriteSchema.safeParse(rawBody);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return result.data;
  }

  private writeToValues(body: WishlistEntryWrite): WishlistCriteriaValues {
    return {
      clubId: body.clubId ?? null,
      nationalTeamId: body.nationalTeamId ?? null,
      seasonId: body.seasonId ?? null,
      type: body.type ?? null,
      size: body.size ?? null,
    };
  }

  private async getOwnedEntryRow(userId: string, entryId: string): Promise<WishlistRow> {
    const [row] = await this.db
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
      .where(eq(wishlistEntry.id, entryId))
      .limit(1);

    if (!row) {
      throw new NotFoundException("Wishlist entry not found");
    }

    if (row.userId !== userId) {
      throw new ForbiddenException("Wishlist entry not found");
    }

    return row;
  }

  private async validateCatalogIds(body: WishlistEntryWrite): Promise<void> {
    if (body.clubId) {
      const [row] = await this.db
        .select({ id: club.id })
        .from(club)
        .where(eq(club.id, body.clubId))
        .limit(1);
      if (!row) {
        throw new BadRequestException("clubId is not catalog truth");
      }
    }

    if (body.nationalTeamId) {
      const [row] = await this.db
        .select({ id: nationalTeam.id })
        .from(nationalTeam)
        .where(eq(nationalTeam.id, body.nationalTeamId))
        .limit(1);
      if (!row) {
        throw new BadRequestException("nationalTeamId is not catalog truth");
      }
    }

    if (body.seasonId) {
      const [row] = await this.db
        .select({ id: season.id })
        .from(season)
        .where(eq(season.id, body.seasonId))
        .limit(1);
      if (!row) {
        throw new BadRequestException("seasonId is not catalog truth");
      }
    }
  }

  /** Create and update: the row with the Matches it finds now. Nothing is marked seen. */
  private async toEntryResponseWithMatches(
    row: WishlistRow,
    locale: LabelLocale,
  ): Promise<WishlistEntry> {
    await this.matchService.syncMatchesForOwner(row.userId);
    const { byEntry } = await this.matchService.loadMatchesForEntries([row.id], WISHLIST_MATCH_CAP);
    return this.toEntryResponse(row, locale, byEntry.get(row.id));
  }

  private async toEntryResponse(
    row: WishlistRow,
    locale: LabelLocale,
    entryMatches: EntryMatches = { matches: [], matchCount: 0, unseenCount: 0 },
  ): Promise<WishlistEntry> {
    const clubLabel = row.clubId ? await this.resolveEntityLabel("club", row.clubId, locale) : null;
    const nationalTeamLabel = row.nationalTeamId
      ? await this.resolveEntityLabel("national_team", row.nationalTeamId, locale)
      : null;
    const seasonLabel = row.seasonId ? await this.resolveSeasonLabel(row.seasonId) : null;
    const typeLabel = resolveWishlistTypeLabel(row.type);
    const sizeLabel = resolveWishlistSizeLabel(row.size);

    const labels = {
      clubLabel,
      nationalTeamLabel,
      seasonLabel,
      typeLabel,
      sizeLabel,
    };

    const name = buildWishlistAutoName(labels);
    const meta = buildWishlistAndMeta(labels);

    if (!name || !meta) {
      throw new BadRequestException("Wishlist entry has no criteria");
    }

    return wishlistEntrySchema.parse({
      id: row.id,
      name,
      meta,
      clubId: row.clubId,
      clubLabel,
      nationalTeamId: row.nationalTeamId,
      nationalTeamLabel,
      seasonId: row.seasonId,
      seasonLabel,
      type: row.type,
      typeLabel,
      size: row.size,
      sizeLabel,
      ...entryMatches,
    });
  }

  private async resolveSeasonLabel(seasonId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ label: season.label })
      .from(season)
      .where(eq(season.id, seasonId))
      .limit(1);

    return row?.label ?? null;
  }

  private async resolveEntityLabel(
    entityType: "club" | "national_team",
    entityId: string,
    locale: LabelLocale,
  ): Promise<string | null> {
    const rows = await this.db
      .select({
        entityId: catalogLabel.entityId,
        label: catalogLabel.text,
        locale: catalogLabel.locale,
        kind: catalogLabel.kind,
      })
      .from(catalogLabel)
      .where(
        and(eq(catalogLabel.entityType, entityType), inArray(catalogLabel.entityId, [entityId])),
      );

    const entityLabels = rows.filter((row) => row.entityId === entityId && row.label);
    return (
      entityLabels.find((row) => row.locale === locale && row.kind === "label")?.label ??
      entityLabels.find((row) => row.locale === "mul" && row.kind === "label")?.label ??
      entityLabels.find((row) => row.locale === "en" && row.kind === "label")?.label ??
      null
    );
  }
}
