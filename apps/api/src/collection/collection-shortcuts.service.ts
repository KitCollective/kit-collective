import {
  type CollectionShortcut,
  type CollectionShortcuts,
  type CollectionShortcutWrite,
  collectionShortcutReorderSchema,
  collectionShortcutSchema,
  collectionShortcutsSchema,
  collectionShortcutWriteSchema,
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
import { and, asc, count, eq, exists, inArray, type SQL } from "drizzle-orm";
import { DB } from "../db/db.module.js";

type ShortcutFacets = {
  countryId: string | null;
  leagueId: string | null;
  clubId: string | null;
  playerId: string | null;
};

type CatalogEntityType = "country" | "league" | "club" | "player";

@Injectable()
export class CollectionShortcutsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async listShortcuts(userId: string, locale: LabelLocale = "da"): Promise<CollectionShortcuts> {
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

    const countryIds = this.uniqueIds(rows.map((row) => row.countryId));
    const leagueIds = this.uniqueIds(rows.map((row) => row.leagueId));
    const clubIds = this.uniqueIds(rows.map((row) => row.clubId));
    const playerIds = this.uniqueIds(rows.map((row) => row.playerId));

    const [countryLabels, leagueLabels, clubLabels, playerLabels] = await Promise.all([
      this.resolveEntityLabels("country", countryIds, locale),
      this.resolveEntityLabels("league", leagueIds, locale),
      this.resolveEntityLabels("club", clubIds, locale),
      this.resolveEntityLabels("player", playerIds, locale),
    ]);

    const shortcuts: CollectionShortcut[] = await Promise.all(
      rows.map(async (row) => {
        const facets = this.rowToFacets(row);
        const matchCount = await this.countMatchingJerseys(userId, facets);

        return collectionShortcutSchema.parse({
          id: row.id,
          name: row.name,
          sortOrder: row.sortOrder,
          countryId: row.countryId,
          countryLabel: row.countryId ? (countryLabels.get(row.countryId) ?? null) : null,
          leagueId: row.leagueId,
          leagueLabel: row.leagueId ? (leagueLabels.get(row.leagueId) ?? null) : null,
          clubId: row.clubId,
          clubLabel: row.clubId ? (clubLabels.get(row.clubId) ?? null) : null,
          playerId: row.playerId,
          playerLabel: row.playerId ? (playerLabels.get(row.playerId) ?? null) : null,
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

    const facets = this.writeToFacets(body);
    const name = body.name ?? (await this.buildAutoName(facets, locale));
    const sortOrder = body.sortOrder ?? (await this.nextSortOrder(userId));

    const [inserted] = await this.db
      .insert(collectionShortcut)
      .values({
        userId,
        name,
        sortOrder,
        countryId: facets.countryId,
        leagueId: facets.leagueId,
        clubId: facets.clubId,
        playerId: facets.playerId,
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

    return this.toShortcutResponse(userId, inserted, locale);
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

    const facets = this.writeToFacets(body);
    const name = body.name ?? (await this.buildAutoName(facets, locale));
    const sortOrder = body.sortOrder ?? existing.sortOrder;

    const [updated] = await this.db
      .update(collectionShortcut)
      .set({
        name,
        sortOrder,
        countryId: facets.countryId,
        leagueId: facets.leagueId,
        clubId: facets.clubId,
        playerId: facets.playerId,
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

    return this.toShortcutResponse(userId, updated, locale);
  }

  async reorderShortcuts(userId: string, rawBody: unknown): Promise<CollectionShortcuts> {
    const body = collectionShortcutReorderSchema.parse(rawBody);
    const owned = await this.db
      .select({ id: collectionShortcut.id })
      .from(collectionShortcut)
      .where(eq(collectionShortcut.userId, userId));

    const ownedIds = new Set(owned.map((row) => row.id));
    if (body.orderedIds.length !== ownedIds.size) {
      throw new BadRequestException("orderedIds must include every owned shortcut exactly once");
    }

    for (const id of body.orderedIds) {
      if (!ownedIds.has(id)) {
        throw new BadRequestException("orderedIds contains a shortcut not owned by the user");
      }
    }

    await Promise.all(
      body.orderedIds.map((id, index) =>
        this.db
          .update(collectionShortcut)
          .set({ sortOrder: index, updatedAt: new Date() })
          .where(and(eq(collectionShortcut.id, id), eq(collectionShortcut.userId, userId))),
      ),
    );

    return this.listShortcuts(userId);
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
    return this.rowToFacets(row);
  }

  buildJerseyFilterConditions(userId: string, facets: ShortcutFacets): SQL[] {
    const conditions: SQL[] = [eq(userJersey.userId, userId)];

    if (facets.countryId) {
      conditions.push(
        exists(
          this.db
            .select({ id: club.id })
            .from(club)
            .where(and(eq(club.id, userJersey.clubId), eq(club.countryId, facets.countryId))),
        ),
      );
    }

    if (facets.leagueId) {
      conditions.push(
        exists(
          this.db
            .select({ id: season.id })
            .from(season)
            .where(and(eq(season.id, userJersey.seasonId), eq(season.leagueId, facets.leagueId))),
        ),
      );
    }

    if (facets.clubId) {
      conditions.push(eq(userJersey.clubId, facets.clubId));
    }

    if (facets.playerId) {
      conditions.push(
        exists(
          this.db
            .select({ id: playerClubSeason.id })
            .from(playerClubSeason)
            .where(
              and(
                eq(playerClubSeason.playerId, facets.playerId),
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

  private async buildAutoName(facets: ShortcutFacets, locale: LabelLocale): Promise<string> {
    const parts: string[] = [];

    if (facets.countryId) {
      const label = await this.resolveEntityLabel("country", facets.countryId, locale);
      if (!label) {
        throw new BadRequestException("countryId is not catalog truth");
      }
      parts.push(label);
    }

    if (facets.leagueId) {
      const label = await this.resolveEntityLabel("league", facets.leagueId, locale);
      if (!label) {
        throw new BadRequestException("leagueId is not catalog truth");
      }
      parts.push(label);
    }

    if (facets.clubId) {
      const label = await this.resolveEntityLabel("club", facets.clubId, locale);
      if (!label) {
        throw new BadRequestException("clubId is not catalog truth");
      }
      parts.push(label);
    }

    if (facets.playerId) {
      const label = await this.resolveEntityLabel("player", facets.playerId, locale);
      if (!label) {
        throw new BadRequestException("playerId is not catalog truth");
      }
      parts.push(label);
    }

    if (parts.length === 0) {
      throw new BadRequestException("At least one facet is required");
    }

    return parts.join(" · ");
  }

  private async toShortcutResponse(
    userId: string,
    row: {
      id: string;
      name: string;
      sortOrder: number;
      countryId: string | null;
      leagueId: string | null;
      clubId: string | null;
      playerId: string | null;
    },
    locale: LabelLocale,
  ): Promise<CollectionShortcut> {
    const facets = this.rowToFacets(row);
    const matchCount = await this.countMatchingJerseys(userId, facets);

    const [countryLabel, leagueLabel, clubLabel, playerLabel] = await Promise.all([
      row.countryId
        ? this.resolveEntityLabel("country", row.countryId, locale)
        : Promise.resolve(null),
      row.leagueId
        ? this.resolveEntityLabel("league", row.leagueId, locale)
        : Promise.resolve(null),
      row.clubId ? this.resolveEntityLabel("club", row.clubId, locale) : Promise.resolve(null),
      row.playerId
        ? this.resolveEntityLabel("player", row.playerId, locale)
        : Promise.resolve(null),
    ]);

    return collectionShortcutSchema.parse({
      id: row.id,
      name: row.name,
      sortOrder: row.sortOrder,
      countryId: row.countryId,
      countryLabel,
      leagueId: row.leagueId,
      leagueLabel,
      clubId: row.clubId,
      clubLabel,
      playerId: row.playerId,
      playerLabel,
      matchCount,
    });
  }

  private rowToFacets(row: {
    countryId: string | null;
    leagueId: string | null;
    clubId: string | null;
    playerId: string | null;
  }): ShortcutFacets {
    return {
      countryId: row.countryId,
      leagueId: row.leagueId,
      clubId: row.clubId,
      playerId: row.playerId,
    };
  }

  private writeToFacets(body: CollectionShortcutWrite): ShortcutFacets {
    return {
      countryId: body.countryId ?? null,
      leagueId: body.leagueId ?? null,
      clubId: body.clubId ?? null,
      playerId: body.playerId ?? null,
    };
  }

  private uniqueIds(values: Array<string | null>): string[] {
    return [...new Set(values.filter((value): value is string => value !== null))];
  }

  private async resolveEntityLabels(
    entityType: CatalogEntityType,
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

  private async resolveEntityLabel(
    entityType: CatalogEntityType,
    entityId: string,
    locale: LabelLocale,
  ): Promise<string | null> {
    const labels = await this.resolveEntityLabels(entityType, [entityId], locale);
    return labels.get(entityId) ?? null;
  }
}
