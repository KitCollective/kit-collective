import {
  type CatalogClubSearchResponse,
  type CatalogClubSeasonsResponse,
  type CatalogFacetSearchResponse,
  type CatalogStats,
  catalogClubSearchResponseSchema,
  catalogClubSeasonsResponseSchema,
  catalogFacetSearchResponseSchema,
  catalogStatsSchema,
  isDevCatalogFixtureId,
  omitDevCatalogFixtureRows,
} from "@kit/api-contract";
import type { Db } from "@kit/db";
import {
  catalogLabel,
  club,
  country,
  externalId,
  kit,
  kitPhoto,
  league,
  manufacturer,
  nationalTeam,
  nationalTeamSeason,
  patch,
  player,
  playerClubSeason,
  playerNationalTeamSeason,
  season,
  teamSeason,
  user,
} from "@kit/db";
import type { LabelLocale } from "@kit/domain";
import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { DB } from "../db/db.module.js";
import { buildPeekHtml, type PeekClubRow, type PeekKitRow } from "./catalog-peek.js";

@Injectable()
export class CatalogService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async getStats(): Promise<CatalogStats> {
    const [
      countries,
      leagues,
      clubs,
      nationalTeams,
      seasons,
      teamSeasons,
      players,
      playerClubSeasons,
      manufacturers,
      kits,
      kitPhotos,
      catalogLabels,
      externalIds,
      users,
    ] = await Promise.all([
      this.db.select({ count: count() }).from(country),
      this.db.select({ count: count() }).from(league),
      this.db.select({ count: count() }).from(club),
      this.db.select({ count: count() }).from(nationalTeam),
      this.db.select({ count: count() }).from(season),
      this.db.select({ count: count() }).from(teamSeason),
      this.db.select({ count: count() }).from(player),
      this.db.select({ count: count() }).from(playerClubSeason),
      this.db.select({ count: count() }).from(manufacturer),
      this.db.select({ count: count() }).from(kit),
      this.db.select({ count: count() }).from(kitPhoto),
      this.db.select({ count: count() }).from(catalogLabel),
      this.db.select({ count: count() }).from(externalId),
      this.db.select({ count: count() }).from(user),
    ]);

    const stats = {
      countries: countries[0]?.count ?? 0,
      leagues: leagues[0]?.count ?? 0,
      clubs: clubs[0]?.count ?? 0,
      nationalTeams: nationalTeams[0]?.count ?? 0,
      seasons: seasons[0]?.count ?? 0,
      teamSeasons: teamSeasons[0]?.count ?? 0,
      players: players[0]?.count ?? 0,
      playerClubSeasons: playerClubSeasons[0]?.count ?? 0,
      manufacturers: manufacturers[0]?.count ?? 0,
      kits: kits[0]?.count ?? 0,
      kitPhotos: kitPhotos[0]?.count ?? 0,
      catalogLabels: catalogLabels[0]?.count ?? 0,
      externalIds: externalIds[0]?.count ?? 0,
      users: users[0]?.count ?? 0,
    };

    return catalogStatsSchema.parse(stats);
  }

  async getPeekHtml(): Promise<string> {
    const seasons = await this.db
      .select({ id: season.id, label: season.label })
      .from(season)
      .orderBy(asc(season.startsOn));

    if (seasons.length === 0) {
      return buildPeekHtml([], []);
    }

    const clubLabel = sql<string>`coalesce(
      max(case when ${catalogLabel.locale} = 'da' and ${catalogLabel.kind} = 'label' then ${catalogLabel.text} end),
      max(case when ${catalogLabel.kind} = 'label' then ${catalogLabel.text} end),
      ${club.id}::text
    )`;

    const clubRows = await this.db
      .select({
        seasonId: season.id,
        seasonLabel: season.label,
        clubId: club.id,
        clubName: clubLabel,
        squadCount: sql<number>`count(distinct ${playerClubSeason.id})::int`,
      })
      .from(teamSeason)
      .innerJoin(season, eq(teamSeason.seasonId, season.id))
      .innerJoin(club, eq(teamSeason.clubId, club.id))
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.entityId, club.id)),
      )
      .leftJoin(
        playerClubSeason,
        and(eq(playerClubSeason.clubId, club.id), eq(playerClubSeason.seasonId, season.id)),
      )
      .groupBy(season.id, season.label, club.id)
      .orderBy(asc(season.startsOn), asc(club.id));

    const kitRows = await this.db
      .select({
        clubId: kit.clubId,
        seasonId: kit.seasonId,
        kitType: kit.type,
        photoCount: sql<number>`count(${kitPhoto.id})::int`,
      })
      .from(kit)
      .leftJoin(kitPhoto, eq(kitPhoto.kitId, kit.id))
      .where(sql`${kit.clubId} is not null`)
      .groupBy(kit.clubId, kit.seasonId, kit.type)
      .orderBy(asc(kit.seasonId), asc(kit.clubId), asc(kit.type));

    const clubs: PeekClubRow[] = clubRows
      .filter((row) => row.clubId !== null)
      .map((row) => ({
        seasonId: row.seasonId,
        seasonLabel: row.seasonLabel,
        clubId: row.clubId,
        clubName: row.clubName,
        squadCount: row.squadCount,
      }));

    const kits: PeekKitRow[] = kitRows
      .filter((row): row is typeof row & { clubId: string } => row.clubId !== null)
      .map((row) => ({
        clubId: row.clubId,
        seasonId: row.seasonId,
        kitType: row.kitType,
        photoCount: row.photoCount,
      }));

    return buildPeekHtml(clubs, kits);
  }

  async searchClubs(query: string, locale: LabelLocale): Promise<CatalogClubSearchResponse> {
    const trimmed = query.trim();
    const pattern = trimmed.length > 0 ? `%${trimmed}%` : `%`;

    const matches = await this.db
      .selectDistinct({
        entityType: catalogLabel.entityType,
        entityId: catalogLabel.entityId,
      })
      .from(catalogLabel)
      .where(
        and(
          inArray(catalogLabel.entityType, ["club", "national_team"]),
          sql`${catalogLabel.text} ilike ${pattern}`,
        ),
      );

    if (matches.length === 0) {
      return catalogClubSearchResponseSchema.parse({ clubs: [] });
    }

    const clubIds = matches.filter((row) => row.entityType === "club").map((row) => row.entityId);
    const nationalTeamIds = matches
      .filter((row) => row.entityType === "national_team")
      .map((row) => row.entityId);

    const resolvedLabel = () =>
      sql<string | null>`coalesce(
        max(case when ${catalogLabel.locale} = ${locale} and ${catalogLabel.kind} = 'label' then ${catalogLabel.text} end),
        max(case when ${catalogLabel.locale} = 'mul' and ${catalogLabel.kind} = 'label' then ${catalogLabel.text} end),
        max(case when ${catalogLabel.locale} = 'en' and ${catalogLabel.kind} = 'label' then ${catalogLabel.text} end)
      )`;

    const clubRows =
      clubIds.length === 0
        ? []
        : await this.db
            .select({
              id: club.id,
              label: resolvedLabel(),
              kind: sql<"club">`'club'`,
            })
            .from(club)
            .leftJoin(
              catalogLabel,
              and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.entityId, club.id)),
            )
            .where(inArray(club.id, clubIds))
            .groupBy(club.id);

    const nationalTeamRows =
      nationalTeamIds.length === 0
        ? []
        : await this.db
            .select({
              id: nationalTeam.id,
              label: resolvedLabel(),
              kind: sql<"national_team">`'national_team'`,
            })
            .from(nationalTeam)
            .leftJoin(
              catalogLabel,
              and(
                eq(catalogLabel.entityType, "national_team"),
                eq(catalogLabel.entityId, nationalTeam.id),
              ),
            )
            .where(inArray(nationalTeam.id, nationalTeamIds))
            .groupBy(nationalTeam.id);

    const clubs = omitDevCatalogFixtureRows(
      [...clubRows, ...nationalTeamRows]
        .filter((row): row is typeof row & { label: string; kind: "club" | "national_team" } =>
          Boolean(row.label),
        )
        .map((row) => ({ id: row.id, label: row.label, kind: row.kind }))
        .sort((a, b) => a.label.localeCompare(b.label, locale)),
    ).slice(0, 80);

    return catalogClubSearchResponseSchema.parse({ clubs });
  }

  async searchCountries(query: string, locale: LabelLocale): Promise<CatalogFacetSearchResponse> {
    return this.searchFacetEntities("country", query, locale);
  }

  async searchLeagues(query: string, locale: LabelLocale): Promise<CatalogFacetSearchResponse> {
    return this.searchFacetEntities("league", query, locale);
  }

  async searchPlayers(
    query: string,
    locale: LabelLocale,
    scope?: { clubId?: string; seasonId?: string },
  ): Promise<CatalogFacetSearchResponse> {
    if (scope?.clubId) {
      if (isDevCatalogFixtureId(scope.clubId)) {
        return catalogFacetSearchResponseSchema.parse({ items: [] });
      }
      return this.searchSquadPlayers(scope.clubId, scope.seasonId, query, locale);
    }
    return this.searchFacetEntities("player", query, locale);
  }

  private async searchSquadPlayers(
    clubId: string,
    seasonId: string | undefined,
    query: string,
    locale: LabelLocale,
  ): Promise<CatalogFacetSearchResponse> {
    const [clubRow] = await this.db
      .select({ id: club.id })
      .from(club)
      .where(eq(club.id, clubId))
      .limit(1);

    if (clubRow) {
      const conditions = [eq(playerClubSeason.clubId, clubId)];
      if (seasonId) {
        conditions.push(eq(playerClubSeason.seasonId, seasonId));
      }

      const rows = await this.db
        .select({
          id: player.id,
          label: this.resolvedPickerLabel(locale),
          squadNumber: sql<number | null>`max(${playerClubSeason.squadNumber})`,
        })
        .from(playerClubSeason)
        .innerJoin(player, eq(player.id, playerClubSeason.playerId))
        .leftJoin(
          catalogLabel,
          and(eq(catalogLabel.entityType, "player"), eq(catalogLabel.entityId, player.id)),
        )
        .where(and(...conditions))
        .groupBy(player.id);

      return this.toSquadPickerItems(rows, query, locale);
    }

    const [nationalTeamRow] = await this.db
      .select({ id: nationalTeam.id })
      .from(nationalTeam)
      .where(eq(nationalTeam.id, clubId))
      .limit(1);

    if (nationalTeamRow) {
      const conditions = [eq(playerNationalTeamSeason.nationalTeamId, clubId)];
      if (seasonId) {
        conditions.push(eq(playerNationalTeamSeason.seasonId, seasonId));
      }

      const rows = await this.db
        .select({
          id: player.id,
          label: this.resolvedPickerLabel(locale),
          squadNumber: sql<number | null>`max(${playerNationalTeamSeason.squadNumber})`,
        })
        .from(playerNationalTeamSeason)
        .innerJoin(player, eq(player.id, playerNationalTeamSeason.playerId))
        .leftJoin(
          catalogLabel,
          and(eq(catalogLabel.entityType, "player"), eq(catalogLabel.entityId, player.id)),
        )
        .where(and(...conditions))
        .groupBy(player.id);

      return this.toSquadPickerItems(rows, query, locale);
    }

    return catalogFacetSearchResponseSchema.parse({ items: [] });
  }

  private resolvedPickerLabel(locale: LabelLocale) {
    return sql<string | null>`coalesce(
      max(case when ${catalogLabel.locale} = ${locale} and ${catalogLabel.kind} = 'label' then ${catalogLabel.text} end),
      max(case when ${catalogLabel.locale} = 'mul' and ${catalogLabel.kind} = 'label' then ${catalogLabel.text} end),
      max(case when ${catalogLabel.locale} = 'en' and ${catalogLabel.kind} = 'label' then ${catalogLabel.text} end)
    )`;
  }

  private toSquadPickerItems(
    rows: { id: string; label: string | null; squadNumber: number | null }[],
    query: string,
    locale: LabelLocale,
  ): CatalogFacetSearchResponse {
    const trimmed = query.trim().toLowerCase();
    const items = rows
      .filter((row): row is typeof row & { label: string } => Boolean(row.label))
      .map((row) => {
        const item: { id: string; label: string; meta?: string } = {
          id: row.id,
          label: row.label,
        };
        if (row.squadNumber != null) {
          item.meta = `Nr. ${row.squadNumber}`;
        }
        return item;
      })
      .filter((item) => {
        if (!trimmed) {
          return true;
        }
        return (
          item.label.toLowerCase().includes(trimmed) ||
          (item.meta?.toLowerCase().includes(trimmed) ?? false)
        );
      })
      .sort((a, b) => a.label.localeCompare(b.label, locale))
      .slice(0, 80);

    return catalogFacetSearchResponseSchema.parse({
      items: omitDevCatalogFixtureRows(items),
    });
  }

  private async searchFacetEntities(
    entityType: "country" | "league" | "player",
    query: string,
    locale: LabelLocale,
  ): Promise<CatalogFacetSearchResponse> {
    const pattern = `%${query}%`;

    const matches = await this.db
      .selectDistinct({
        entityId: catalogLabel.entityId,
      })
      .from(catalogLabel)
      .where(
        and(eq(catalogLabel.entityType, entityType), sql`${catalogLabel.text} ilike ${pattern}`),
      );

    if (matches.length === 0) {
      return catalogFacetSearchResponseSchema.parse({ items: [] });
    }

    const entityIds = matches.map((row) => row.entityId);

    const resolvedLabel = () =>
      sql<string | null>`coalesce(
        max(case when ${catalogLabel.locale} = ${locale} and ${catalogLabel.kind} = 'label' then ${catalogLabel.text} end),
        max(case when ${catalogLabel.locale} = 'mul' and ${catalogLabel.kind} = 'label' then ${catalogLabel.text} end),
        max(case when ${catalogLabel.locale} = 'en' and ${catalogLabel.kind} = 'label' then ${catalogLabel.text} end)
      )`;

    const baseTable =
      entityType === "country" ? country : entityType === "league" ? league : player;

    const rows = await this.db
      .select({
        id: baseTable.id,
        label: resolvedLabel(),
      })
      .from(baseTable)
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, entityType), eq(catalogLabel.entityId, baseTable.id)),
      )
      .where(inArray(baseTable.id, entityIds))
      .groupBy(baseTable.id);

    const items = omitDevCatalogFixtureRows(
      rows
        .filter((row): row is typeof row & { label: string } => Boolean(row.label))
        .map((row) => ({ id: row.id, label: row.label }))
        .sort((a, b) => a.label.localeCompare(b.label, locale)),
    );

    return catalogFacetSearchResponseSchema.parse({ items });
  }

  async getClubSeasons(clubId: string): Promise<CatalogClubSeasonsResponse> {
    const [clubRow] = await this.db
      .select({ id: club.id })
      .from(club)
      .where(eq(club.id, clubId))
      .limit(1);

    if (clubRow) {
      const rows = await this.db
        .select({
          id: season.id,
          label: season.label,
        })
        .from(teamSeason)
        .innerJoin(season, eq(teamSeason.seasonId, season.id))
        .where(eq(teamSeason.clubId, clubId))
        .orderBy(desc(season.startsOn));

      return catalogClubSeasonsResponseSchema.parse({
        seasons: rows.map((row) => ({ id: row.id, label: row.label })),
      });
    }

    const [nationalTeamRow] = await this.db
      .select({ id: nationalTeam.id })
      .from(nationalTeam)
      .where(eq(nationalTeam.id, clubId))
      .limit(1);

    if (nationalTeamRow) {
      const [seasonLinkRows, kitRows] = await Promise.all([
        this.db
          .select({
            id: season.id,
            label: season.label,
            startsOn: season.startsOn,
          })
          .from(nationalTeamSeason)
          .innerJoin(season, eq(nationalTeamSeason.seasonId, season.id))
          .where(eq(nationalTeamSeason.nationalTeamId, clubId)),
        this.db
          .selectDistinct({
            id: season.id,
            label: season.label,
            startsOn: season.startsOn,
          })
          .from(kit)
          .innerJoin(season, eq(kit.seasonId, season.id))
          .where(eq(kit.nationalTeamId, clubId)),
      ]);

      const seasonsById = new Map<string, { id: string; label: string; startsOn: string }>();
      for (const row of [...seasonLinkRows, ...kitRows]) {
        seasonsById.set(row.id, row);
      }
      const seasons = [...seasonsById.values()].sort((left, right) =>
        right.startsOn.localeCompare(left.startsOn),
      );

      return catalogClubSeasonsResponseSchema.parse({
        seasons: seasons.map((row) => ({ id: row.id, label: row.label })),
      });
    }

    return catalogClubSeasonsResponseSchema.parse({ seasons: [] });
  }

  async getSeasonPatches(
    seasonId: string,
    locale: LabelLocale = "da",
  ): Promise<CatalogFacetSearchResponse> {
    const rows = await this.db
      .select({
        id: patch.id,
        label: sql<string | null>`coalesce(
          max(case when ${catalogLabel.locale} = ${locale} and ${catalogLabel.kind} = 'label' then ${catalogLabel.text} end),
          max(case when ${catalogLabel.locale} = 'mul' and ${catalogLabel.kind} = 'label' then ${catalogLabel.text} end),
          max(case when ${catalogLabel.locale} = 'en' and ${catalogLabel.kind} = 'label' then ${catalogLabel.text} end)
        )`,
      })
      .from(patch)
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "patch"), eq(catalogLabel.entityId, patch.id)),
      )
      .where(eq(patch.seasonId, seasonId))
      .groupBy(patch.id);

    const items = omitDevCatalogFixtureRows(
      rows
        .filter((row): row is typeof row & { label: string } => Boolean(row.label))
        .map((row) => ({ id: row.id, label: row.label }))
        .sort((a, b) => a.label.localeCompare(b.label, locale)),
    );

    return catalogFacetSearchResponseSchema.parse({ items });
  }
}
