import {
  type AdminClubSeasonDrill,
  type AdminFilterOptions,
  type AdminKitDrill,
  type AdminStamdataList,
  type AdminStamdataQuery,
  type AdminStamdataRow,
  adminClubSeasonDrillSchema,
  adminFilterOptionsSchema,
  adminKitDrillSchema,
  adminStamdataListSchema,
} from "@kit/api-contract";
import type { Db } from "@kit/db";
import {
  catalogLabel,
  club,
  country,
  kit,
  kitPhoto,
  league,
  player,
  playerClubSeason,
  season,
  teamSeason,
} from "@kit/db";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import type { ObjectStoreAdapter } from "../collection/object-store.js";
import { createMemoryObjectStore } from "../collection/object-store.js";
import { createR2ObjectStore } from "../collection/r2-object-store.js";
import { DB } from "../db/db.module.js";

export const ADMIN_OBJECT_STORE = Symbol("ADMIN_OBJECT_STORE");

function hasR2Config(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_BUCKET &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY,
  );
}

function monogramFromLabel(label: string): string {
  const words = label
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) {
    return "?";
  }
  if (words.length === 1) {
    return (words[0] ?? "?").slice(0, 2).toUpperCase();
  }
  return words
    .slice(0, 2)
    .map((word) => (word[0] ?? "?").toUpperCase())
    .join("");
}

const resolvedEnLabel = sql<string | null>`coalesce(
  max(case when ${catalogLabel.locale} = 'en' and ${catalogLabel.kind} = 'label' then ${catalogLabel.text} end),
  max(case when ${catalogLabel.locale} = 'mul' and ${catalogLabel.kind} = 'label' then ${catalogLabel.text} end)
)`;

@Injectable()
export class AdminCatalogService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ADMIN_OBJECT_STORE) private readonly objectStore: ObjectStoreAdapter,
  ) {}

  static objectStoreFactory(): ObjectStoreAdapter {
    if (hasR2Config()) {
      return createR2ObjectStore();
    }
    return createMemoryObjectStore();
  }

  async listStamdata(query: AdminStamdataQuery): Promise<AdminStamdataList> {
    const rows: AdminStamdataRow[] = [];
    const searchPattern = query.q ? `%${query.q}%` : null;

    if (!query.kitType && query.hasPhoto !== "true") {
      rows.push(...(await this.listClubRows(query, searchPattern)));
      rows.push(...(await this.listSeasonRows(query, searchPattern)));
      rows.push(...(await this.listClubSeasonRows(query, searchPattern)));
    }

    rows.push(...(await this.listKitRows(query, searchPattern)));

    rows.sort((a, b) => a.label.localeCompare(b.label, "en"));

    return adminStamdataListSchema.parse({
      total: rows.length,
      rows,
    });
  }

  async getFilterOptions(): Promise<AdminFilterOptions> {
    const countries = await this.db
      .select({
        id: country.id,
        label: resolvedEnLabel,
      })
      .from(country)
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "country"), eq(catalogLabel.entityId, country.id)),
      )
      .groupBy(country.id)
      .orderBy(asc(country.iso3166));

    const leagues = await this.db
      .select({
        id: league.id,
        label: resolvedEnLabel,
      })
      .from(league)
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "league"), eq(catalogLabel.entityId, league.id)),
      )
      .groupBy(league.id)
      .orderBy(asc(league.id));

    const seasons = await this.db
      .select({
        id: season.id,
        label: season.label,
      })
      .from(season)
      .orderBy(desc(season.startsOn));

    return adminFilterOptionsSchema.parse({
      countries: countries
        .filter((row): row is typeof row & { label: string } => Boolean(row.label))
        .map((row) => ({ id: row.id, label: row.label })),
      leagues: leagues
        .filter((row): row is typeof row & { label: string } => Boolean(row.label))
        .map((row) => ({ id: row.id, label: row.label })),
      seasons: seasons.map((row) => ({ id: row.id, label: row.label })),
      kitTypes: ["home", "away", "third", "gk", "special"],
    });
  }

  async getKitDrill(kitId: string): Promise<AdminKitDrill> {
    const [row] = await this.db
      .select({
        id: kit.id,
        kitType: kit.type,
        clubLabel: resolvedEnLabel,
        seasonLabel: season.label,
        photoId: kitPhoto.id,
      })
      .from(kit)
      .innerJoin(season, eq(kit.seasonId, season.id))
      .leftJoin(club, eq(kit.clubId, club.id))
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.entityId, club.id)),
      )
      .leftJoin(kitPhoto, eq(kitPhoto.kitId, kit.id))
      .where(eq(kit.id, kitId))
      .groupBy(kit.id, kit.type, season.label, kitPhoto.id)
      .limit(1);

    if (!row) {
      throw new NotFoundException("Kit not found");
    }

    const label = `${row.clubLabel ?? "Kit"} ${row.kitType}`;
    const hasPhoto = Boolean(row.photoId);

    return adminKitDrillSchema.parse({
      id: row.id,
      label,
      kitType: row.kitType,
      clubLabel: row.clubLabel ?? undefined,
      seasonLabel: row.seasonLabel,
      hasPhoto,
      photoPath: hasPhoto ? `/v1/admin/catalog/kits/${row.id}/photo` : undefined,
    });
  }

  async getKitPhotoBytes(kitId: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    const [photo] = await this.db
      .select({
        objectKey: kitPhoto.objectKey,
      })
      .from(kitPhoto)
      .where(eq(kitPhoto.kitId, kitId))
      .limit(1);

    if (!photo) {
      throw new NotFoundException("Kit photo not found");
    }

    const bytes = await this.objectStore.getObject(photo.objectKey);
    if (!bytes) {
      throw new NotFoundException("Kit photo bytes not found");
    }

    return { bytes, contentType: "image/jpeg" };
  }

  async getClubSeasonDrill(
    clubId: string,
    seasonId: string,
    expandSquad = false,
  ): Promise<AdminClubSeasonDrill> {
    const [header] = await this.db
      .select({
        clubLabel: resolvedEnLabel,
        seasonLabel: season.label,
        squadCount: sql<number>`count(distinct ${playerClubSeason.id})::int`,
      })
      .from(teamSeason)
      .innerJoin(club, eq(teamSeason.clubId, club.id))
      .innerJoin(season, eq(teamSeason.seasonId, season.id))
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.entityId, club.id)),
      )
      .leftJoin(
        playerClubSeason,
        and(eq(playerClubSeason.clubId, club.id), eq(playerClubSeason.seasonId, season.id)),
      )
      .where(and(eq(teamSeason.clubId, clubId), eq(teamSeason.seasonId, seasonId)))
      .groupBy(club.id, season.label)
      .limit(1);

    if (!header?.clubLabel) {
      throw new NotFoundException("Club season not found");
    }

    let squad: AdminClubSeasonDrill["squad"];
    if (expandSquad) {
      const players = await this.db
        .select({
          id: player.id,
          label: resolvedEnLabel,
          squadNumber: playerClubSeason.squadNumber,
        })
        .from(playerClubSeason)
        .innerJoin(player, eq(playerClubSeason.playerId, player.id))
        .leftJoin(
          catalogLabel,
          and(eq(catalogLabel.entityType, "player"), eq(catalogLabel.entityId, player.id)),
        )
        .where(and(eq(playerClubSeason.clubId, clubId), eq(playerClubSeason.seasonId, seasonId)))
        .groupBy(player.id, playerClubSeason.squadNumber)
        .orderBy(asc(playerClubSeason.squadNumber), asc(player.id));

      squad = players
        .filter((row): row is typeof row & { label: string } => Boolean(row.label))
        .map((row) => ({
          id: row.id,
          label: row.label,
          squadNumber: row.squadNumber,
        }));
    }

    return adminClubSeasonDrillSchema.parse({
      clubId,
      seasonId,
      clubLabel: header.clubLabel,
      seasonLabel: header.seasonLabel,
      squadCount: header.squadCount,
      squad,
    });
  }

  private async matchingClubIds(pattern: string | null): Promise<Set<string>> {
    if (!pattern) {
      return new Set();
    }

    const matches = await this.db
      .select({
        entityId: catalogLabel.entityId,
      })
      .from(catalogLabel)
      .where(and(eq(catalogLabel.entityType, "club"), sql`${catalogLabel.text} ilike ${pattern}`));

    return new Set(matches.map((match) => match.entityId));
  }

  private async listClubRows(
    query: AdminStamdataQuery,
    searchPattern: string | null,
  ): Promise<AdminStamdataRow[]> {
    const conditions: SQL[] = [];

    if (query.countryId) {
      conditions.push(eq(club.countryId, query.countryId));
    }
    if (query.leagueId) {
      conditions.push(
        sql`exists (
          select 1 from ${teamSeason}
          inner join ${season} on ${teamSeason.seasonId} = ${season.id}
          where ${teamSeason.clubId} = ${club.id}
          and ${season.leagueId} = ${query.leagueId}
        )`,
      );
    }
    if (query.seasonId) {
      conditions.push(
        sql`exists (
          select 1 from ${teamSeason}
          where ${teamSeason.clubId} = ${club.id}
          and ${teamSeason.seasonId} = ${query.seasonId}
        )`,
      );
    }

    const clubIds = await this.matchingClubIds(searchPattern);
    if (searchPattern) {
      if (clubIds.size === 0) {
        return [];
      }
      conditions.push(inArray(club.id, [...clubIds]));
    }

    const rows = await this.db
      .select({
        id: club.id,
        label: resolvedEnLabel,
      })
      .from(club)
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.entityId, club.id)),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(club.id)
      .orderBy(asc(club.id));

    return rows
      .filter((row): row is typeof row & { label: string } => Boolean(row.label))
      .map((row) => ({
        entityType: "club" as const,
        id: row.id,
        label: row.label,
        monogram: monogramFromLabel(row.label),
      }));
  }

  private async listSeasonRows(
    query: AdminStamdataQuery,
    searchPattern: string | null,
  ): Promise<AdminStamdataRow[]> {
    const conditions: SQL[] = [];

    if (query.countryId) {
      conditions.push(
        sql`exists (
          select 1 from ${league}
          where ${season.leagueId} = ${league.id}
          and ${league.countryId} = ${query.countryId}
        )`,
      );
    }
    if (query.leagueId) {
      conditions.push(eq(season.leagueId, query.leagueId));
    }
    if (query.seasonId) {
      conditions.push(eq(season.id, query.seasonId));
    }

    if (searchPattern) {
      conditions.push(sql`${season.label} ilike ${searchPattern}`);
    }

    const rows = await this.db
      .select({
        id: season.id,
        label: season.label,
      })
      .from(season)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(season.startsOn));

    return rows.map((row) => ({
      entityType: "season" as const,
      id: row.id,
      label: row.label,
      monogram: monogramFromLabel(row.label),
    }));
  }

  private async listClubSeasonRows(
    query: AdminStamdataQuery,
    searchPattern: string | null,
  ): Promise<AdminStamdataRow[]> {
    const conditions: SQL[] = [];

    if (query.countryId) {
      conditions.push(eq(club.countryId, query.countryId));
    }
    if (query.leagueId) {
      conditions.push(eq(season.leagueId, query.leagueId));
    }
    if (query.seasonId) {
      conditions.push(eq(season.id, query.seasonId));
    }

    const clubIds = await this.matchingClubIds(searchPattern);
    if (searchPattern) {
      if (clubIds.size > 0) {
        conditions.push(inArray(club.id, [...clubIds]));
      } else {
        const seasonMatch = await this.db
          .select({ id: season.id })
          .from(season)
          .where(sql`${season.label} ilike ${searchPattern}`);
        if (seasonMatch.length === 0) {
          return [];
        }
        conditions.push(
          inArray(
            season.id,
            seasonMatch.map((row) => row.id),
          ),
        );
      }
    }

    const rows = await this.db
      .select({
        id: teamSeason.id,
        clubId: club.id,
        seasonId: season.id,
        clubLabel: resolvedEnLabel,
        seasonLabel: season.label,
        squadCount: sql<number>`count(distinct ${playerClubSeason.id})::int`,
      })
      .from(teamSeason)
      .innerJoin(club, eq(teamSeason.clubId, club.id))
      .innerJoin(season, eq(teamSeason.seasonId, season.id))
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.entityId, club.id)),
      )
      .leftJoin(
        playerClubSeason,
        and(eq(playerClubSeason.clubId, club.id), eq(playerClubSeason.seasonId, season.id)),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(teamSeason.id, club.id, season.id, season.label)
      .orderBy(desc(season.startsOn), asc(club.id));

    return rows
      .filter((row): row is typeof row & { clubLabel: string } => Boolean(row.clubLabel))
      .map((row) => ({
        entityType: "club_season" as const,
        id: row.id,
        label: `${row.clubLabel} · ${row.seasonLabel}`,
        monogram: monogramFromLabel(row.clubLabel),
        clubId: row.clubId,
        seasonId: row.seasonId,
        clubLabel: row.clubLabel,
        seasonLabel: row.seasonLabel,
        squadCount: row.squadCount,
      }));
  }

  private async listKitRows(
    query: AdminStamdataQuery,
    searchPattern: string | null,
  ): Promise<AdminStamdataRow[]> {
    const conditions: SQL[] = [];

    if (query.countryId) {
      conditions.push(eq(club.countryId, query.countryId));
    }
    if (query.leagueId) {
      conditions.push(eq(season.leagueId, query.leagueId));
    }
    if (query.seasonId) {
      conditions.push(eq(kit.seasonId, query.seasonId));
    }
    if (query.kitType) {
      conditions.push(eq(kit.type, query.kitType));
    }

    const clubIds = await this.matchingClubIds(searchPattern);
    if (searchPattern) {
      const searchClauses: SQL[] = [];
      if (clubIds.size > 0) {
        searchClauses.push(inArray(kit.clubId, [...clubIds]));
      }
      searchClauses.push(
        sql`exists (
          select 1 from ${season}
          where ${season.id} = ${kit.seasonId}
          and ${season.label} ilike ${searchPattern}
        )`,
      );
      searchClauses.push(sql`${kit.type}::text ilike ${searchPattern}`);
      const searchClause = or(...searchClauses);
      if (searchClause) {
        conditions.push(searchClause);
      }
    }

    const photoCountSql = sql<number>`count(${kitPhoto.id})::int`;

    const rows = await this.db
      .select({
        id: kit.id,
        kitType: kit.type,
        clubId: kit.clubId,
        seasonId: kit.seasonId,
        clubLabel: resolvedEnLabel,
        seasonLabel: season.label,
        photoCount: photoCountSql,
      })
      .from(kit)
      .innerJoin(season, eq(kit.seasonId, season.id))
      .leftJoin(club, eq(kit.clubId, club.id))
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.entityId, club.id)),
      )
      .leftJoin(kitPhoto, eq(kitPhoto.kitId, kit.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(kit.id, kit.type, kit.clubId, kit.seasonId, season.label)
      .orderBy(desc(season.startsOn), asc(kit.type));

    return rows
      .filter((row) => {
        const hasPhoto = row.photoCount > 0;
        if (query.hasPhoto === "true") {
          return hasPhoto;
        }
        if (query.hasPhoto === "false") {
          return !hasPhoto;
        }
        return true;
      })
      .map((row) => {
        const hasPhoto = row.photoCount > 0;
        const clubName = row.clubLabel ?? "Kit";
        const label = `${clubName} ${row.kitType}`;
        return {
          entityType: "kit" as const,
          id: row.id,
          label,
          clubId: row.clubId ?? undefined,
          seasonId: row.seasonId,
          clubLabel: row.clubLabel ?? undefined,
          seasonLabel: row.seasonLabel,
          kitType: row.kitType,
          hasPhoto,
          photoPath: hasPhoto ? `/v1/admin/catalog/kits/${row.id}/photo` : undefined,
        };
      });
  }
}
