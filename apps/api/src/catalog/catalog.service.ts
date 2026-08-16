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
import { count } from "drizzle-orm";
import { DB } from "../db/db.module.js";
import type { Db } from "@kit/db";

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
}
