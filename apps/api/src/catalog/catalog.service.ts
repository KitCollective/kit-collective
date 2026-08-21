import { Inject, Injectable } from "@nestjs/common";
import { catalogStatsSchema, type CatalogStats } from "@kit/api-contract";
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
  player,
  playerClubSeason,
  season,
  teamSeason,
  user,
} from "@kit/db";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { DB } from "../db/db.module.js";
import type { Db } from "@kit/db";
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
        and(
          eq(playerClubSeason.clubId, club.id),
          eq(playerClubSeason.seasonId, season.id),
        ),
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
      .filter((row) => row.clubId !== null)
      .map((row) => ({
        clubId: row.clubId!,
        seasonId: row.seasonId,
        kitType: row.kitType,
        photoCount: row.photoCount,
      }));

    return buildPeekHtml(clubs, kits);
  }
}
