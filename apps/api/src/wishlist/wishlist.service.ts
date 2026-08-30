import {
  type WishlistEntries,
  type WishlistEntry,
  type WishlistEntryWrite,
  wishlistEntriesSchema,
  wishlistEntrySchema,
  wishlistEntryWriteSchema,
} from "@kit/api-contract";
import type { Db } from "@kit/db";
import { catalogLabel, club, season, wishlistEntry } from "@kit/db";
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
import { DB } from "../db/db.module.js";

type WishlistRow = {
  id: string;
  userId: string;
  clubId: string | null;
  seasonId: string | null;
  type: KitType | null;
  size: JerseySize | null;
};

@Injectable()
export class WishlistService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async listEntries(userId: string, locale: LabelLocale = "da"): Promise<WishlistEntries> {
    const rows = await this.db
      .select({
        id: wishlistEntry.id,
        userId: wishlistEntry.userId,
        clubId: wishlistEntry.clubId,
        seasonId: wishlistEntry.seasonId,
        type: wishlistEntry.type,
        size: wishlistEntry.size,
      })
      .from(wishlistEntry)
      .where(eq(wishlistEntry.userId, userId))
      .orderBy(asc(wishlistEntry.createdAt));

    const entries: WishlistEntry[] = await Promise.all(
      rows.map((row) => this.toEntryResponse(row, locale)),
    );

    return wishlistEntriesSchema.parse({ entries });
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
        seasonId: values.seasonId,
        type: values.type,
        size: values.size,
      })
      .returning({
        id: wishlistEntry.id,
        userId: wishlistEntry.userId,
        clubId: wishlistEntry.clubId,
        seasonId: wishlistEntry.seasonId,
        type: wishlistEntry.type,
        size: wishlistEntry.size,
      });

    if (!inserted) {
      throw new BadRequestException("Could not create wishlist entry");
    }

    return this.toEntryResponse(inserted, locale);
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

    const [updated] = await this.db
      .update(wishlistEntry)
      .set({
        clubId: values.clubId,
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
        seasonId: wishlistEntry.seasonId,
        type: wishlistEntry.type,
        size: wishlistEntry.size,
      });

    if (!updated) {
      throw new NotFoundException("Wishlist entry not found");
    }

    return this.toEntryResponse(updated, locale);
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

  private writeToValues(body: WishlistEntryWrite): WishlistRow {
    return {
      id: "",
      userId: "",
      clubId: body.clubId ?? null,
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

  private async toEntryResponse(row: WishlistRow, locale: LabelLocale): Promise<WishlistEntry> {
    const clubLabel = row.clubId ? await this.resolveEntityLabel("club", row.clubId, locale) : null;
    const seasonLabel = row.seasonId ? await this.resolveSeasonLabel(row.seasonId) : null;
    const typeLabel = resolveWishlistTypeLabel(row.type);
    const sizeLabel = resolveWishlistSizeLabel(row.size);

    const labels = {
      clubLabel,
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
      seasonId: row.seasonId,
      seasonLabel,
      type: row.type,
      typeLabel,
      size: row.size,
      sizeLabel,
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
    entityType: "club",
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
