import {
  type AdminClubDrill,
  type AdminClubSeasonDrill,
  type AdminFilterOptions,
  type AdminKitDrill,
  type AdminLeagueDrill,
  type AdminPlayerDrill,
  type AdminSeasonDrill,
  type AdminStamdataList,
  type AdminStamdataQuery,
  type AdminStamdataRow,
  adminClubDrillSchema,
  adminClubSeasonDrillSchema,
  adminFilterOptionsSchema,
  adminKitDrillSchema,
  adminLeagueDrillSchema,
  adminPlayerDrillSchema,
  adminSeasonDrillSchema,
  adminStamdataListSchema,
} from "@kit/api-contract";
import type { Db } from "@kit/db";
import {
  catalogLabel,
  catalogMark,
  club,
  country,
  honour,
  kit,
  kitPhoto,
  league,
  player,
  playerClubSeason,
  playerPhoto,
  season,
  teamSeason,
} from "@kit/db";
import { compareSquadOrder, KIT_TYPES } from "@kit/domain";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, inArray, or, type SQL, type SQLWrapper, sql } from "drizzle-orm";
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

const DEFAULT_PAGE_SIZE = 50;

function sniffImageContentType(bytes: Uint8Array): string {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "image/jpeg";
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return "application/octet-stream";
}

function clubMarkPath(clubId: string): string {
  return `/admin/catalog/clubs/${clubId}/mark`;
}

function leagueMarkPath(leagueId: string): string {
  return `/admin/catalog/leagues/${leagueId}/mark`;
}

function honourMarkPath(honourId: string): string {
  return `/admin/catalog/honours/${honourId}/mark`;
}

function playerPhotoPath(playerId: string): string {
  return `/admin/catalog/players/${playerId}/photo`;
}

function pageLimit(query: AdminStamdataQuery): number {
  return query.limit ?? DEFAULT_PAGE_SIZE;
}

function pageOffset(query: AdminStamdataQuery): number {
  return query.offset ?? 0;
}

function countryLabelSubquery(entityIdColumn: SQLWrapper) {
  return sql<string | null>`(
    select coalesce(
      max(case when country_label.locale = 'en' and country_label.kind = 'label' then country_label.text end),
      max(case when country_label.locale = 'mul' and country_label.kind = 'label' then country_label.text end)
    )
    from catalog_label as country_label
    where country_label.entity_type = 'country'
      and country_label.entity_id = ${entityIdColumn}
  )`;
}

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
    const searchPattern = query.q ? `%${query.q}%` : null;
    const entityType = query.entityType ?? "club";

    if (entityType === "league") {
      return this.listLeaguePage(query, searchPattern);
    }
    if (entityType === "player") {
      return this.listPlayerPage(query, searchPattern);
    }
    return this.listClubPage(query, searchPattern);
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
      kitTypes: [...KIT_TYPES],
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
      photoPath: hasPhoto ? `/admin/catalog/kits/${row.id}/photo` : undefined,
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

    return { bytes, contentType: sniffImageContentType(bytes) };
  }

  async getCatalogMarkBytes(
    entityType: "club" | "league" | "honour",
    entityId: string,
  ): Promise<{ bytes: Uint8Array; contentType: string }> {
    const [row] = await this.db
      .select({ objectKey: catalogMark.objectKey })
      .from(catalogMark)
      .where(and(eq(catalogMark.entityType, entityType), eq(catalogMark.entityId, entityId)))
      .limit(1);

    if (!row) {
      throw new NotFoundException("Catalog mark not found");
    }

    const bytes = await this.objectStore.getObject(row.objectKey);
    if (!bytes) {
      throw new NotFoundException("Catalog mark bytes not found");
    }

    return { bytes, contentType: sniffImageContentType(bytes) };
  }

  async getPlayerPhotoBytes(playerId: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    const [row] = await this.db
      .select({ objectKey: playerPhoto.objectKey })
      .from(playerPhoto)
      .where(eq(playerPhoto.playerId, playerId))
      .limit(1);

    if (!row) {
      throw new NotFoundException("Player photo not found");
    }

    const bytes = await this.objectStore.getObject(row.objectKey);
    if (!bytes) {
      throw new NotFoundException("Player photo bytes not found");
    }

    return { bytes, contentType: sniffImageContentType(bytes) };
  }

  async getClubSeasonDrill(
    clubId: string,
    seasonId: string,
    expandSquad = false,
  ): Promise<AdminClubSeasonDrill> {
    const [clubRow] = await this.db
      .select({
        clubLabel: resolvedEnLabel,
      })
      .from(club)
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.entityId, club.id)),
      )
      .where(eq(club.id, clubId))
      .groupBy(club.id)
      .limit(1);

    const [seasonRow] = await this.db
      .select({
        seasonLabel: season.label,
      })
      .from(season)
      .where(eq(season.id, seasonId))
      .limit(1);

    if (!clubRow?.clubLabel || !seasonRow) {
      throw new NotFoundException("Club season not found");
    }

    const [countRow] = await this.db
      .select({
        squadCount: sql<number>`count(${playerClubSeason.id})::int`,
      })
      .from(playerClubSeason)
      .where(and(eq(playerClubSeason.clubId, clubId), eq(playerClubSeason.seasonId, seasonId)));

    let squad: AdminClubSeasonDrill["squad"];
    if (expandSquad) {
      const players = await this.db
        .select({
          id: player.id,
          label: resolvedEnLabel,
          squadNumber: playerClubSeason.squadNumber,
          position: playerClubSeason.position,
        })
        .from(playerClubSeason)
        .innerJoin(player, eq(playerClubSeason.playerId, player.id))
        .leftJoin(
          catalogLabel,
          and(eq(catalogLabel.entityType, "player"), eq(catalogLabel.entityId, player.id)),
        )
        .where(and(eq(playerClubSeason.clubId, clubId), eq(playerClubSeason.seasonId, seasonId)))
        .groupBy(player.id, playerClubSeason.squadNumber, playerClubSeason.position)
        .orderBy(asc(playerClubSeason.squadNumber), asc(player.id));

      squad = players
        .filter((row): row is typeof row & { label: string } => Boolean(row.label))
        .map((row) => ({
          id: row.id,
          label: row.label,
          squadNumber: row.squadNumber,
          position: row.position,
        }))
        .sort(compareSquadOrder);
    }

    const kits = await this.listClubSeasonKits(clubId, seasonId);

    return adminClubSeasonDrillSchema.parse({
      clubId,
      seasonId,
      clubLabel: clubRow.clubLabel,
      seasonLabel: seasonRow.seasonLabel,
      squadCount: countRow?.squadCount ?? 0,
      squad,
      kits,
    });
  }

  async getClubDrill(clubId: string): Promise<AdminClubDrill> {
    const [row] = await this.db
      .select({
        id: club.id,
        countryId: club.countryId,
        kind: club.kind,
        validFrom: club.validFrom,
        validTo: club.validTo,
        successorClubId: club.successorClubId,
        foundedOn: club.foundedOn,
        stadiumName: club.stadiumName,
        stadiumCapacity: club.stadiumCapacity,
        websiteUrl: club.websiteUrl,
        label: resolvedEnLabel,
      })
      .from(club)
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.entityId, club.id)),
      )
      .where(eq(club.id, clubId))
      .groupBy(
        club.id,
        club.countryId,
        club.kind,
        club.validFrom,
        club.validTo,
        club.successorClubId,
        club.foundedOn,
        club.stadiumName,
        club.stadiumCapacity,
        club.websiteUrl,
      )
      .limit(1);

    if (!row?.label) {
      throw new NotFoundException("Club not found");
    }

    let countryLabel: string | undefined;
    if (row.countryId) {
      const [countryRow] = await this.db
        .select({
          label: resolvedEnLabel,
        })
        .from(country)
        .leftJoin(
          catalogLabel,
          and(eq(catalogLabel.entityType, "country"), eq(catalogLabel.entityId, country.id)),
        )
        .where(eq(country.id, row.countryId))
        .groupBy(country.id)
        .limit(1);
      countryLabel = countryRow?.label ?? undefined;
    }

    let successorLabel: string | undefined;
    if (row.successorClubId) {
      const [successorRow] = await this.db
        .select({
          label: resolvedEnLabel,
        })
        .from(club)
        .leftJoin(
          catalogLabel,
          and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.entityId, club.id)),
        )
        .where(eq(club.id, row.successorClubId))
        .groupBy(club.id)
        .limit(1);
      successorLabel = successorRow?.label ?? undefined;
    }

    return adminClubDrillSchema.parse({
      id: row.id,
      label: row.label,
      countryLabel,
      monogram: monogramFromLabel(row.label),
      markPath: (await this.catalogMarkPaths("club", [clubId])).get(clubId),
      kind: row.kind,
      validFrom: row.validFrom ?? null,
      validTo: row.validTo ?? null,
      successorLabel,
      currentLeagueLabel: await this.currentLeagueLabel(clubId),
      foundedOn: row.foundedOn ?? null,
      stadiumName: row.stadiumName ?? null,
      stadiumCapacity: row.stadiumCapacity ?? null,
      websiteUrl: row.websiteUrl ?? null,
      seasons: await this.listClubSeasons(clubId),
      honours: await this.listClubHonours(clubId),
    });
  }

  async getSeasonDrill(seasonId: string): Promise<AdminSeasonDrill> {
    const [row] = await this.db
      .select({
        id: season.id,
        label: season.label,
        leagueLabel: resolvedEnLabel,
      })
      .from(season)
      .leftJoin(league, eq(season.leagueId, league.id))
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "league"), eq(catalogLabel.entityId, league.id)),
      )
      .where(eq(season.id, seasonId))
      .groupBy(season.id, season.label)
      .limit(1);

    if (!row) {
      throw new NotFoundException("Season not found");
    }

    return adminSeasonDrillSchema.parse({
      id: row.id,
      label: row.label,
      leagueLabel: row.leagueLabel ?? undefined,
      monogram: monogramFromLabel(row.label),
    });
  }

  async getLeagueDrill(leagueId: string): Promise<AdminLeagueDrill> {
    const [row] = await this.db
      .select({
        id: league.id,
        label: resolvedEnLabel,
        countryLabel: countryLabelSubquery(league.countryId),
      })
      .from(league)
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "league"), eq(catalogLabel.entityId, league.id)),
      )
      .where(eq(league.id, leagueId))
      .groupBy(league.id, league.countryId)
      .limit(1);

    if (!row?.label) {
      throw new NotFoundException("League not found");
    }

    const seasons = await this.db
      .select({
        id: season.id,
        label: season.label,
      })
      .from(season)
      .where(eq(season.leagueId, leagueId))
      .orderBy(desc(season.startsOn));

    return adminLeagueDrillSchema.parse({
      id: row.id,
      label: row.label,
      countryLabel: row.countryLabel ?? undefined,
      monogram: monogramFromLabel(row.label),
      markPath: (await this.catalogMarkPaths("league", [leagueId])).get(leagueId),
      seasons,
    });
  }

  async getPlayerDrill(playerId: string): Promise<AdminPlayerDrill> {
    const [row] = await this.db
      .select({
        id: player.id,
        label: resolvedEnLabel,
        dateOfBirth: player.dateOfBirth,
        countryLabel: countryLabelSubquery(player.primaryCountryId),
      })
      .from(player)
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "player"), eq(catalogLabel.entityId, player.id)),
      )
      .where(eq(player.id, playerId))
      .groupBy(player.id, player.dateOfBirth, player.primaryCountryId)
      .limit(1);

    if (!row?.label) {
      throw new NotFoundException("Player not found");
    }

    const clubSeasons = await this.db
      .select({
        clubLabel: resolvedEnLabel,
        seasonLabel: season.label,
        squadNumber: playerClubSeason.squadNumber,
      })
      .from(playerClubSeason)
      .innerJoin(club, eq(playerClubSeason.clubId, club.id))
      .innerJoin(season, eq(playerClubSeason.seasonId, season.id))
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.entityId, club.id)),
      )
      .where(eq(playerClubSeason.playerId, playerId))
      .groupBy(
        playerClubSeason.id,
        club.id,
        season.label,
        season.startsOn,
        playerClubSeason.squadNumber,
      )
      .orderBy(desc(season.startsOn));

    return adminPlayerDrillSchema.parse({
      id: row.id,
      label: row.label,
      monogram: monogramFromLabel(row.label),
      markPath: (await this.playerPhotoPaths([playerId])).get(playerId),
      dateOfBirth: row.dateOfBirth ?? null,
      countryLabel: row.countryLabel ?? undefined,
      clubSeasons: clubSeasons
        .filter((item): item is typeof item & { clubLabel: string } => Boolean(item.clubLabel))
        .map((item) => ({
          clubLabel: item.clubLabel,
          seasonLabel: item.seasonLabel,
          squadNumber: item.squadNumber,
        })),
    });
  }

  private async matchingCatalogIds(searchPattern: string | null): Promise<{
    countries: Set<string>;
    leagues: Set<string>;
    clubs: Set<string>;
    players: Set<string>;
  }> {
    if (!searchPattern) {
      return {
        countries: new Set(),
        leagues: new Set(),
        clubs: new Set(),
        players: new Set(),
      };
    }

    const matches = await this.db
      .select({
        entityType: catalogLabel.entityType,
        entityId: catalogLabel.entityId,
      })
      .from(catalogLabel)
      .where(
        and(
          inArray(catalogLabel.entityType, ["country", "league", "club", "player"]),
          sql`${catalogLabel.text} ilike ${searchPattern}`,
        ),
      );

    const countries = new Set<string>();
    const leagues = new Set<string>();
    const clubs = new Set<string>();
    const players = new Set<string>();
    for (const match of matches) {
      if (match.entityType === "country") {
        countries.add(match.entityId);
      } else if (match.entityType === "league") {
        leagues.add(match.entityId);
      } else if (match.entityType === "club") {
        clubs.add(match.entityId);
      } else if (match.entityType === "player") {
        players.add(match.entityId);
      }
    }

    return { countries, leagues, clubs, players };
  }

  private async listClubPage(
    query: AdminStamdataQuery,
    searchPattern: string | null,
  ): Promise<AdminStamdataList> {
    const conditions: SQL[] = [];

    if (query.countryIds && query.countryIds.length > 0) {
      conditions.push(inArray(club.countryId, query.countryIds));
    }
    if (query.leagueIds && query.leagueIds.length > 0) {
      conditions.push(
        sql`exists (
          select 1 from ${teamSeason}
          inner join ${season} on ${teamSeason.seasonId} = ${season.id}
          where ${teamSeason.clubId} = ${club.id}
          and ${inArray(season.leagueId, query.leagueIds)}
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

    const catalogIds = await this.matchingCatalogIds(searchPattern);
    if (searchPattern) {
      const searchClauses: SQL[] = [];
      if (catalogIds.clubs.size > 0) {
        searchClauses.push(inArray(club.id, [...catalogIds.clubs]));
      }
      if (catalogIds.countries.size > 0) {
        searchClauses.push(inArray(club.countryId, [...catalogIds.countries]));
      }
      if (catalogIds.leagues.size > 0) {
        searchClauses.push(
          sql`exists (
            select 1 from ${teamSeason}
            inner join ${season} on ${teamSeason.seasonId} = ${season.id}
            where ${teamSeason.clubId} = ${club.id}
            and ${season.leagueId} in (${sql.join(
              [...catalogIds.leagues].map((id) => sql`${id}`),
              sql`, `,
            )})
          )`,
        );
      }
      if (searchClauses.length === 0) {
        return adminStamdataListSchema.parse({ total: 0, rows: [] });
      }
      const searchClause = or(...searchClauses);
      if (searchClause) {
        conditions.push(searchClause);
      }
    }

    const rows = await this.db
      .select({
        id: club.id,
        label: resolvedEnLabel,
        countryLabel: countryLabelSubquery(club.countryId),
      })
      .from(club)
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.entityId, club.id)),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(club.id, club.countryId)
      .orderBy(asc(resolvedEnLabel));

    const mapped: AdminStamdataRow[] = rows
      .filter((row): row is typeof row & { label: string } => Boolean(row.label))
      .map((row) => ({
        entityType: "club" as const,
        id: row.id,
        label: row.label,
        monogram: monogramFromLabel(row.label),
        countryLabel: row.countryLabel ?? undefined,
      }));

    const offset = pageOffset(query);
    const limit = pageLimit(query);
    const page = mapped.slice(offset, offset + limit);
    const markPaths = await this.catalogMarkPaths(
      "club",
      page.map((row) => row.id),
    );
    return adminStamdataListSchema.parse({
      total: mapped.length,
      rows: page.map((row) => ({
        ...row,
        markPath: markPaths.get(row.id),
      })),
    });
  }

  private async listLeaguePage(
    query: AdminStamdataQuery,
    searchPattern: string | null,
  ): Promise<AdminStamdataList> {
    const conditions: SQL[] = [];

    if (query.countryIds && query.countryIds.length > 0) {
      conditions.push(inArray(league.countryId, query.countryIds));
    }

    const catalogIds = await this.matchingCatalogIds(searchPattern);
    if (searchPattern) {
      const searchClauses: SQL[] = [];
      if (catalogIds.leagues.size > 0) {
        searchClauses.push(inArray(league.id, [...catalogIds.leagues]));
      }
      if (catalogIds.countries.size > 0) {
        searchClauses.push(inArray(league.countryId, [...catalogIds.countries]));
      }
      if (searchClauses.length === 0) {
        return adminStamdataListSchema.parse({ total: 0, rows: [] });
      }
      const searchClause = or(...searchClauses);
      if (searchClause) {
        conditions.push(searchClause);
      }
    }

    const rows = await this.db
      .select({
        id: league.id,
        label: resolvedEnLabel,
        countryLabel: countryLabelSubquery(league.countryId),
      })
      .from(league)
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "league"), eq(catalogLabel.entityId, league.id)),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(league.id, league.countryId)
      .orderBy(asc(resolvedEnLabel));

    const mapped: AdminStamdataRow[] = rows
      .filter((row): row is typeof row & { label: string } => Boolean(row.label))
      .map((row) => ({
        entityType: "league" as const,
        id: row.id,
        label: row.label,
        monogram: monogramFromLabel(row.label),
        countryLabel: row.countryLabel ?? undefined,
      }));

    const offset = pageOffset(query);
    const limit = pageLimit(query);
    const page = mapped.slice(offset, offset + limit);
    const markPaths = await this.catalogMarkPaths(
      "league",
      page.map((row) => row.id),
    );
    return adminStamdataListSchema.parse({
      total: mapped.length,
      rows: page.map((row) => ({
        ...row,
        markPath: markPaths.get(row.id),
      })),
    });
  }

  private async listPlayerPage(
    query: AdminStamdataQuery,
    searchPattern: string | null,
  ): Promise<AdminStamdataList> {
    const conditions: SQL[] = [];

    if (query.countryIds && query.countryIds.length > 0) {
      conditions.push(inArray(player.primaryCountryId, query.countryIds));
    }
    if (query.leagueIds && query.leagueIds.length > 0) {
      conditions.push(
        sql`exists (
          select 1 from ${playerClubSeason}
          inner join ${season} on ${playerClubSeason.seasonId} = ${season.id}
          where ${playerClubSeason.playerId} = ${player.id}
          and ${inArray(season.leagueId, query.leagueIds)}
        )`,
      );
    }

    const catalogIds = await this.matchingCatalogIds(searchPattern);
    if (searchPattern) {
      const searchClauses: SQL[] = [];
      if (catalogIds.players.size > 0) {
        searchClauses.push(inArray(player.id, [...catalogIds.players]));
      }
      if (catalogIds.countries.size > 0) {
        searchClauses.push(inArray(player.primaryCountryId, [...catalogIds.countries]));
      }
      if (catalogIds.clubs.size > 0) {
        searchClauses.push(
          sql`exists (
            select 1 from ${playerClubSeason}
            where ${playerClubSeason.playerId} = ${player.id}
            and ${playerClubSeason.clubId} in (${sql.join(
              [...catalogIds.clubs].map((id) => sql`${id}`),
              sql`, `,
            )})
          )`,
        );
      }
      if (searchClauses.length === 0) {
        return adminStamdataListSchema.parse({ total: 0, rows: [] });
      }
      const searchClause = or(...searchClauses);
      if (searchClause) {
        conditions.push(searchClause);
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const countRows = await this.db
      .select({
        total: sql<number>`cast(count(distinct ${player.id}) as int)`,
      })
      .from(player)
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "player"), eq(catalogLabel.entityId, player.id)),
      )
      .where(whereClause);
    const total = countRows[0]?.total ?? 0;

    const rows = await this.db
      .select({
        id: player.id,
        label: resolvedEnLabel,
        dateOfBirth: player.dateOfBirth,
        countryLabel: countryLabelSubquery(player.primaryCountryId),
      })
      .from(player)
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "player"), eq(catalogLabel.entityId, player.id)),
      )
      .where(whereClause)
      .groupBy(player.id, player.dateOfBirth, player.primaryCountryId)
      .orderBy(asc(resolvedEnLabel))
      .limit(pageLimit(query))
      .offset(pageOffset(query));

    const photoPaths = await this.playerPhotoPaths(rows.map((row) => row.id));
    return adminStamdataListSchema.parse({
      total,
      rows: rows
        .filter((row): row is typeof row & { label: string } => Boolean(row.label))
        .map((row) => ({
          entityType: "player" as const,
          id: row.id,
          label: row.label,
          monogram: monogramFromLabel(row.label),
          markPath: photoPaths.get(row.id),
          countryLabel: row.countryLabel ?? undefined,
          dateOfBirth: row.dateOfBirth ?? null,
        })),
    });
  }

  private async catalogMarkPaths(
    entityType: "club" | "league" | "honour",
    ids: string[],
  ): Promise<Map<string, string>> {
    const paths = new Map<string, string>();
    if (ids.length === 0) {
      return paths;
    }
    const rows = await this.db
      .select({ entityId: catalogMark.entityId })
      .from(catalogMark)
      .where(and(eq(catalogMark.entityType, entityType), inArray(catalogMark.entityId, ids)));
    const toPath =
      entityType === "club" ? clubMarkPath : entityType === "league" ? leagueMarkPath : honourMarkPath;
    for (const row of rows) {
      paths.set(row.entityId, toPath(row.entityId));
    }
    return paths;
  }

  private async playerPhotoPaths(ids: string[]): Promise<Map<string, string>> {
    const paths = new Map<string, string>();
    if (ids.length === 0) {
      return paths;
    }
    const rows = await this.db
      .select({ playerId: playerPhoto.playerId })
      .from(playerPhoto)
      .where(inArray(playerPhoto.playerId, ids));
    for (const row of rows) {
      paths.set(row.playerId, playerPhotoPath(row.playerId));
    }
    return paths;
  }

  private async listClubHonours(clubId: string) {
    const rows = await this.db
      .select({
        id: honour.id,
        seasonLabel: honour.seasonLabel,
        title: honour.title,
      })
      .from(honour)
      .where(and(eq(honour.subjectType, "club"), eq(honour.subjectId, clubId)))
      .orderBy(desc(honour.seasonLabel), asc(honour.title));
    const markPaths = await this.catalogMarkPaths(
      "honour",
      rows.map((row) => row.id),
    );
    return rows.map((row) => ({
      id: row.id,
      seasonLabel: row.seasonLabel,
      title: row.title,
      markPath: markPaths.get(row.id),
    }));
  }

  private async currentLeagueLabel(clubId: string): Promise<string | undefined> {
    const seasons = await this.listClubSeasons(clubId);
    const latest = seasons[0];
    if (!latest) {
      return undefined;
    }
    const [row] = await this.db
      .select({
        label: resolvedEnLabel,
      })
      .from(season)
      .leftJoin(league, eq(season.leagueId, league.id))
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "league"), eq(catalogLabel.entityId, league.id)),
      )
      .where(eq(season.id, latest.id))
      .groupBy(league.id)
      .limit(1);
    return row?.label ?? undefined;
  }

  private async listClubSeasons(clubId: string): Promise<Array<{ id: string; label: string }>> {
    const fromTeam = await this.db
      .select({
        id: season.id,
        label: season.label,
        startsOn: season.startsOn,
      })
      .from(teamSeason)
      .innerJoin(season, eq(teamSeason.seasonId, season.id))
      .where(eq(teamSeason.clubId, clubId));

    const fromKits = await this.db
      .select({
        id: season.id,
        label: season.label,
        startsOn: season.startsOn,
      })
      .from(kit)
      .innerJoin(season, eq(kit.seasonId, season.id))
      .where(eq(kit.clubId, clubId));

    const fromSquad = await this.db
      .select({
        id: season.id,
        label: season.label,
        startsOn: season.startsOn,
      })
      .from(playerClubSeason)
      .innerJoin(season, eq(playerClubSeason.seasonId, season.id))
      .where(eq(playerClubSeason.clubId, clubId));

    const byId = new Map<string, { id: string; label: string; startsOn: string }>();
    for (const row of [...fromTeam, ...fromKits, ...fromSquad]) {
      byId.set(row.id, row);
    }
    return [...byId.values()]
      .sort((left, right) => right.startsOn.localeCompare(left.startsOn))
      .map(({ id, label }) => ({ id, label }));
  }

  private async listClubSeasonKits(clubId: string, seasonId: string) {
    const photoCountSql = sql<number>`count(${kitPhoto.id})::int`;
    const rows = await this.db
      .select({
        id: kit.id,
        kitType: kit.type,
        clubLabel: resolvedEnLabel,
        photoCount: photoCountSql,
      })
      .from(kit)
      .leftJoin(club, eq(kit.clubId, club.id))
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.entityId, club.id)),
      )
      .leftJoin(kitPhoto, eq(kitPhoto.kitId, kit.id))
      .where(and(eq(kit.clubId, clubId), eq(kit.seasonId, seasonId)))
      .groupBy(kit.id, kit.type)
      .orderBy(asc(kit.type));

    return rows.map((row) => {
      const hasPhoto = row.photoCount > 0;
      const clubName = row.clubLabel ?? "Kit";
      return {
        id: row.id,
        label: `${clubName} ${row.kitType}`,
        kitType: row.kitType,
        hasPhoto,
        photoPath: hasPhoto ? `/admin/catalog/kits/${row.id}/photo` : undefined,
      };
    });
  }
}
