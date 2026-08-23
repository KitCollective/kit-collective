import {
  type CollectionShortcut,
  type CollectionShortcuts,
  type CollectionShortcutWrite,
  collectionShortcutSchema,
  collectionShortcutWriteSchema,
  collectionShortcutsSchema,
} from "@kit/api-contract";
import type { Db } from "@kit/db";
import {
  catalogLabel,
  club,
  collectionShortcut,
  country,
  league,
  player,
  playerClubSeason,
  season,
  userJersey,
} from "@kit/db";
import type { LabelLocale } from "@kit/domain";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, count, eq, exists, type SQL } from "drizzle-orm";
import { DB } from "../db/db.module.js";

type ShortcutFacets = {
  countryId: string | null;
  leagueId: string | null;
  clubId: string | null;
  playerId: string | null;
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
        countryId: collectionShortcut.countryId,
        leagueId: collectionShortcut.leagueId,
        clubId: collectionShortcut.clubId,
        playerId: collectionShortcut.playerId,
      })
      .from(collectionShortcut)
      .where(eq(collectionShortcut.userId, userId))
      .orderBy(asc(collectionShortcut.sortOrder), asc(collectionShortcut.createdAt));

    const shortcuts: CollectionShortcut[] = await Promise.all(
      rows.map(async (row) => {
        const matchCount = await this.countMatchingJerseys(userId, {
          countryId: row.countryId,
          leagueId: row.leagueId,
          clubId: row.clubId,
          playerId: row.playerId,
        });

        return collectionShortcutSchema.parse({
          id: row.id,
          name: row.name,
          sortOrder: row.sortOrder,
          countryId: row.countryId,
          leagueId: row.leagueId,
          clubId: row.clubId,
          playerId: row.playerId,
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
    await this.validateFacetIds(body);

    const name = body.name ?? (await this.buildAutoName(body, locale));
    const sortOrder = body.sortOrder ?? await this.nextSortOrder(userId);

    const [inserted] = await this.db
      .insert(collectionShortcut)
      .values({
        userId,
        name,
        sortOrder,
        countryId: body.countryId ?? null,
        leagueId: body.leagueId ?? null,
        clubId: body.clubId ?? null,
        playerId: body.playerId ?? null,
      })
      .returning({
        id: collectionShortcut.id,
        name: collectionShortcut.name,
        sortOrder: collectionShortcut.sortOrder,
        countryId: collectionShortcut.countryId,
        leagueId: collectionShortcut.leagueId,
        clubId: collectionShortcut.clubId,
        playerId: collectionShortcut.playerId,
      });

    if (!inserted) {
      throw new BadRequestException("Could not create shortcut");
    }

    const matchCount = await this.countMatchingJerseys(userId, {
      countryId: inserted.countryId,
      leagueId: inserted.leagueId,
      clubId: inserted.clubId,
      playerId: inserted.playerId,
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
    await this.validateFacetIds(body);

    const name = body.name ?? (await this.buildAutoName(body, locale));
    const sortOrder = body.sortOrder ?? existing.sortOrder;

    const [updated] = await this.db
      .update(collectionShortcut)
      .set({
        name,
        sortOrder,
        countryId: body.countryId ?? null,
        leagueId: body.leagueId ?? null,
        clubId: body.clubId ?? null,
        playerId: body.playerId ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(collectionShortcut.id, shortcutId), eq(collectionShortcut.userId, userId)))
      .returning({
        id: collectionShortcut.id,
        name: collectionShortcut.name,
        sortOrder: collectionShortcut.sortOrder,
        countryId: collectionShortcut.countryId,
        leagueId: collectionShortcut.leagueId,
        clubId: collectionShortcut.clubId,
        playerId: collectionShortcut.playerId,
      });

    if (!updated) {
      throw new NotFoundException("Shortcut not found");
    }

    const matchCount = await this.countMatchingJerseys(userId, {
      countryId: updated.countryId,
      leagueId: updated.leagueId,
      clubId: updated.clubId,
      playerId: updated.playerId,
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
      .where(
        and(eq(collectionShortcut.id, shortcutId), eq(collectionShortcut.userId, userId)),
      )
      .returning({ id: collectionShortcut.id });

    if (!deleted) {
      throw new NotFoundException("Shortcut not found");
    }
  }

  async getShortcutFacetsForFilter(userId: string, shortcutId: string): Promise<ShortcutFacets> {
    const row = await this.getOwnedShortcutRow(userId, shortcutId);
    return {
      countryId: row.countryId,
      leagueId: row.leagueId,
      clubId: row.clubId,
      playerId: row.playerId,
    };
  }

  buildJerseyFilterConditions(userId: string, facets: ShortcutFacets): SQL[] {
    const conditions: SQL[] = [eq(userJersey.userId, userId)];

    if (facets.clubId) {
      conditions.push(eq(userJersey.clubId, facets.clubId));
    }

    if (facets.leagueId) {
      conditions.push(eq(season.leagueId, facets.leagueId));
    }

    if (facets.countryId) {
      conditions.push(eq(club.countryId, facets.countryId));
    }

    if (facets.playerId) {
      conditions.push(
        exists(
          this.db
            .select({ id: playerClubSeason.id })
            .from(playerClubSeason)
            .where(
              and(
                eq(playerClubSeason.playerId, facets.playerId!),
                eq(playerClubSeason.clubId, userJersey.clubId),
                eq(playerClubSeason.seasonId, userJersey.seasonId),
              ),
            ),
        ),
      );
    }

    return conditions;
  }

  async countMatchingJerseys(userId: string, facets: ShortcutFacets): Promise<number> {
    const conditions = this.buildJerseyFilterConditions(userId, facets);

    const [result] = await this.db
      .select({ value: count() })
      .from(userJersey)
      .innerJoin(season, eq(userJersey.seasonId, season.id))
      .innerJoin(club, eq(userJersey.clubId, club.id))
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
        countryId: collectionShortcut.countryId,
        leagueId: collectionShortcut.leagueId,
        clubId: collectionShortcut.clubId,
        playerId: collectionShortcut.playerId,
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

  private async validateFacetIds(body: CollectionShortcutWrite): Promise<void> {
    if (body.countryId) {
      const [row] = await this.db
        .select({ id: country.id })
        .from(country)
        .where(eq(country.id, body.countryId))
        .limit(1);
      if (!row) {
        throw new BadRequestException("countryId is not catalog truth");
      }
    }

    if (body.leagueId) {
      const [row] = await this.db
        .select({ id: league.id })
        .from(league)
        .where(eq(league.id, body.leagueId))
        .limit(1);
      if (!row) {
        throw new BadRequestException("leagueId is not catalog truth");
      }
    }

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

    if (body.playerId) {
      const [row] = await this.db
        .select({ id: player.id })
        .from(player)
        .where(eq(player.id, body.playerId))
        .limit(1);
      if (!row) {
        throw new BadRequestException("playerId is not catalog truth");
      }
    }
  }

  private async buildAutoName(body: CollectionShortcutWrite, locale: LabelLocale): Promise<string> {
    const labels: string[] = [];

    if (body.countryId) {
      const label = await this.resolveEntityLabel("country", body.countryId, locale);
      if (label) {
        labels.push(label);
      }
    }

    if (body.leagueId) {
      const label = await this.resolveEntityLabel("league", body.leagueId, locale);
      if (label) {
        labels.push(label);
      }
    }

    if (body.clubId) {
      const label = await this.resolveEntityLabel("club", body.clubId, locale);
      if (label) {
        labels.push(label);
      }
    }

    if (body.playerId) {
      const label = await this.resolveEntityLabel("player", body.playerId, locale);
      if (label) {
        labels.push(label);
      }
    }

    if (labels.length === 0) {
      throw new BadRequestException("At least one facet is required");
    }

    return labels.join(" · ");
  }

  private async resolveEntityLabel(
    entityType: "country" | "league" | "club" | "player",
    entityId: string,
    locale: LabelLocale,
  ): Promise<string | null> {
    const rows = await this.db
      .select({
        label: catalogLabel.text,
        locale: catalogLabel.locale,
        kind: catalogLabel.kind,
      })
      .from(catalogLabel)
      .where(
        and(eq(catalogLabel.entityType, entityType), eq(catalogLabel.entityId, entityId)),
      );

    const resolved =
      rows.find((row) => row.locale === locale && row.kind === "label")?.label ??
      rows.find((row) => row.locale === "mul" && row.kind === "label")?.label ??
      rows.find((row) => row.locale === "en" && row.kind === "label")?.label;

    return resolved ?? null;
  }
}
