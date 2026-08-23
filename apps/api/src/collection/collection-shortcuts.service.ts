import {
  type CollectionShortcut,
  type CollectionShortcuts,
  type CollectionShortcutWrite,
  collectionShortcutSchema,
  collectionShortcutsSchema,
  collectionShortcutWriteSchema,
} from "@kit/api-contract";
import type { Db } from "@kit/db";
import { catalogLabel, club, collectionShortcut, userJersey } from "@kit/db";
import type { LabelLocale } from "@kit/domain";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, count, eq, type SQL } from "drizzle-orm";
import { DB } from "../db/db.module.js";

type ShortcutFacets = {
  clubId: string | null;
};

@Injectable()
export class CollectionShortcutsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async listShortcuts(userId: string): Promise<CollectionShortcuts> {
    const rows = await this.db
      .select({
        id: collectionShortcut.id,
        name: collectionShortcut.name,
        sortOrder: collectionShortcut.sortOrder,
        clubId: collectionShortcut.clubId,
      })
      .from(collectionShortcut)
      .where(eq(collectionShortcut.userId, userId))
      .orderBy(asc(collectionShortcut.sortOrder), asc(collectionShortcut.createdAt));

    const shortcuts: CollectionShortcut[] = await Promise.all(
      rows.map(async (row) => {
        const matchCount = await this.countMatchingJerseys(userId, {
          clubId: row.clubId,
        });

        return collectionShortcutSchema.parse({
          id: row.id,
          name: row.name,
          sortOrder: row.sortOrder,
          clubId: row.clubId,
          matchCount,
        });
      }),
    );

    return collectionShortcutsSchema.parse({ shortcuts });
  }

  async createShortcut(
    userId: string,
    rawBody: unknown,
    locale: LabelLocale,
  ): Promise<CollectionShortcut> {
    const body = this.parseShortcutWrite(rawBody);
    await this.validateClubId(body.clubId);

    const name = body.name ?? (await this.buildAutoName(body.clubId, locale));
    const sortOrder = body.sortOrder ?? (await this.nextSortOrder(userId));

    const [inserted] = await this.db
      .insert(collectionShortcut)
      .values({
        userId,
        name,
        sortOrder,
        clubId: body.clubId,
      })
      .returning({
        id: collectionShortcut.id,
        name: collectionShortcut.name,
        sortOrder: collectionShortcut.sortOrder,
        clubId: collectionShortcut.clubId,
      });

    if (!inserted) {
      throw new BadRequestException("Could not create shortcut");
    }

    const matchCount = await this.countMatchingJerseys(userId, {
      clubId: inserted.clubId,
    });

    return collectionShortcutSchema.parse({
      ...inserted,
      matchCount,
    });
  }

  async updateShortcut(
    userId: string,
    shortcutId: string,
    rawBody: unknown,
    locale: LabelLocale,
  ): Promise<CollectionShortcut> {
    const existing = await this.getOwnedShortcutRow(userId, shortcutId);
    const body = this.parseShortcutWrite(rawBody);
    await this.validateClubId(body.clubId);

    const name = body.name ?? (await this.buildAutoName(body.clubId, locale));
    const sortOrder = body.sortOrder ?? existing.sortOrder;

    const [updated] = await this.db
      .update(collectionShortcut)
      .set({
        name,
        sortOrder,
        clubId: body.clubId,
        updatedAt: new Date(),
      })
      .where(and(eq(collectionShortcut.id, shortcutId), eq(collectionShortcut.userId, userId)))
      .returning({
        id: collectionShortcut.id,
        name: collectionShortcut.name,
        sortOrder: collectionShortcut.sortOrder,
        clubId: collectionShortcut.clubId,
      });

    if (!updated) {
      throw new NotFoundException("Shortcut not found");
    }

    const matchCount = await this.countMatchingJerseys(userId, {
      clubId: updated.clubId,
    });

    return collectionShortcutSchema.parse({
      ...updated,
      matchCount,
    });
  }

  async deleteShortcut(userId: string, shortcutId: string): Promise<void> {
    await this.getOwnedShortcutRow(userId, shortcutId);

    const [deleted] = await this.db
      .delete(collectionShortcut)
      .where(and(eq(collectionShortcut.id, shortcutId), eq(collectionShortcut.userId, userId)))
      .returning({ id: collectionShortcut.id });

    if (!deleted) {
      throw new NotFoundException("Shortcut not found");
    }
  }

  async getShortcutFacetsForFilter(userId: string, shortcutId: string): Promise<ShortcutFacets> {
    const row = await this.getOwnedShortcutRow(userId, shortcutId);
    return {
      clubId: row.clubId,
    };
  }

  buildJerseyFilterConditions(userId: string, facets: ShortcutFacets): SQL[] {
    const conditions: SQL[] = [eq(userJersey.userId, userId)];

    if (facets.clubId) {
      conditions.push(eq(userJersey.clubId, facets.clubId));
    }

    return conditions;
  }

  async countMatchingJerseys(userId: string, facets: ShortcutFacets): Promise<number> {
    const conditions = this.buildJerseyFilterConditions(userId, facets);

    const [result] = await this.db
      .select({ value: count() })
      .from(userJersey)
      .where(and(...conditions));

    return Number(result?.value ?? 0);
  }

  private parseShortcutWrite(rawBody: unknown): CollectionShortcutWrite {
    const result = collectionShortcutWriteSchema.safeParse(rawBody);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return result.data;
  }

  private async getOwnedShortcutRow(userId: string, shortcutId: string) {
    const [row] = await this.db
      .select({
        id: collectionShortcut.id,
        userId: collectionShortcut.userId,
        name: collectionShortcut.name,
        sortOrder: collectionShortcut.sortOrder,
        clubId: collectionShortcut.clubId,
      })
      .from(collectionShortcut)
      .where(eq(collectionShortcut.id, shortcutId))
      .limit(1);

    if (!row) {
      throw new NotFoundException("Shortcut not found");
    }

    if (row.userId !== userId) {
      throw new ForbiddenException("Shortcut not found");
    }

    return row;
  }

  private async nextSortOrder(userId: string): Promise<number> {
    const rows = await this.db
      .select({ sortOrder: collectionShortcut.sortOrder })
      .from(collectionShortcut)
      .where(eq(collectionShortcut.userId, userId));

    if (rows.length === 0) {
      return 0;
    }

    const maxSort = rows.reduce((max, current) => Math.max(max, current.sortOrder), -1);
    return maxSort + 1;
  }

  private async validateClubId(clubId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: club.id })
      .from(club)
      .where(eq(club.id, clubId))
      .limit(1);
    if (!row) {
      throw new BadRequestException("clubId is not catalog truth");
    }
  }

  private async buildAutoName(clubId: string, locale: LabelLocale): Promise<string> {
    const label = await this.resolveClubLabel(clubId, locale);
    if (!label) {
      throw new BadRequestException("clubId is not catalog truth");
    }
    return label;
  }

  private async resolveClubLabel(clubId: string, locale: LabelLocale): Promise<string | null> {
    const rows = await this.db
      .select({
        label: catalogLabel.text,
        locale: catalogLabel.locale,
        kind: catalogLabel.kind,
      })
      .from(catalogLabel)
      .where(and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.entityId, clubId)));

    const resolved =
      rows.find((row) => row.locale === locale && row.kind === "label")?.label ??
      rows.find((row) => row.locale === "mul" && row.kind === "label")?.label ??
      rows.find((row) => row.locale === "en" && row.kind === "label")?.label;

    return resolved ?? null;
  }
}
