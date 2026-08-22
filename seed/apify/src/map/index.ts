import {
  catalogLabel,
  club,
  country,
  type Db,
  externalId,
  league,
  player,
  playerClubSeason,
  season,
  teamSeason,
} from "@kit/db";
import type { CatalogEntityType, LabelLocale } from "@kit/domain";
import { and, eq } from "drizzle-orm";
import type { MapResult, NormalizedFacts, NormalizedSeason } from "../types.js";
import { TM_SYSTEM } from "../types.js";

async function findEntityId(db: Db, value: string): Promise<string | undefined> {
  const row = await db
    .select({ entityId: externalId.entityId })
    .from(externalId)
    .where(and(eq(externalId.system, TM_SYSTEM), eq(externalId.value, value)))
    .limit(1);

  return row[0]?.entityId;
}

async function linkExternalId(
  db: Db,
  entityType: (typeof externalId.$inferInsert)["entityType"],
  entityIdValue: string,
  value: string,
): Promise<void> {
  const existing = await findEntityId(db, value);
  if (existing) {
    if (existing !== entityIdValue) {
      throw new Error(`ExternalId ${TM_SYSTEM}:${value} already linked to another entity`);
    }
    return;
  }

  await db.insert(externalId).values({
    entityType,
    entityId: entityIdValue,
    system: TM_SYSTEM,
    value,
  });
}

async function upsertCatalogLabel(
  db: Db,
  entityType: CatalogEntityType,
  entityIdValue: string,
  locale: LabelLocale,
  text: string,
): Promise<boolean> {
  const existing = await db
    .select({ id: catalogLabel.id, text: catalogLabel.text })
    .from(catalogLabel)
    .where(
      and(
        eq(catalogLabel.entityType, entityType),
        eq(catalogLabel.entityId, entityIdValue),
        eq(catalogLabel.locale, locale),
        eq(catalogLabel.kind, "label"),
      ),
    )
    .limit(1);

  if (existing[0]) {
    if (existing[0].text !== text) {
      await db.update(catalogLabel).set({ text }).where(eq(catalogLabel.id, existing[0].id));
      return true;
    }
    return false;
  }

  await db.insert(catalogLabel).values({
    entityType,
    entityId: entityIdValue,
    locale,
    kind: "label",
    text,
    source: "seed",
  });
  return true;
}

async function upsertCountry(
  db: Db,
  iso: string,
  externalValue: string,
  name: string,
): Promise<{ id: string; created: boolean; labels: number; externalIds: number }> {
  const byExternal = await findEntityId(db, externalValue);
  if (byExternal) {
    const labelChanged = await upsertCatalogLabel(db, "country", byExternal, "en", name);
    return { id: byExternal, created: false, labels: labelChanged ? 1 : 0, externalIds: 0 };
  }

  const [row] = await db.insert(country).values({ iso3166: iso }).returning({ id: country.id });
  const id = row!.id;
  await linkExternalId(db, "country", id, externalValue);
  await upsertCatalogLabel(db, "country", id, "en", name);
  return { id, created: true, labels: 1, externalIds: 1 };
}

async function upsertLeagueRow(
  db: Db,
  countryId: string,
  externalValue: string,
  name: string,
): Promise<{ id: string; created: boolean; labels: number; externalIds: number }> {
  const byExternal = await findEntityId(db, externalValue);
  if (byExternal) {
    const labelChanged = await upsertCatalogLabel(db, "league", byExternal, "en", name);
    return { id: byExternal, created: false, labels: labelChanged ? 1 : 0, externalIds: 0 };
  }

  const [row] = await db.insert(league).values({ countryId }).returning({ id: league.id });
  const id = row!.id;
  await linkExternalId(db, "league", id, externalValue);
  await upsertCatalogLabel(db, "league", id, "en", name);
  return { id, created: true, labels: 1, externalIds: 1 };
}

async function upsertSeasonRow(
  db: Db,
  leagueId: string,
  seasonData: NormalizedSeason,
): Promise<{ id: string; created: boolean }> {
  const existing = await db
    .select({ id: season.id })
    .from(season)
    .where(and(eq(season.leagueId, leagueId), eq(season.label, seasonData.label)))
    .limit(1);

  if (existing[0]) {
    return { id: existing[0].id, created: false };
  }

  const [row] = await db
    .insert(season)
    .values({
      leagueId,
      label: seasonData.label,
      startsOn: seasonData.startsOn,
      endsOn: seasonData.endsOn,
      calendarKind: seasonData.calendarKind,
    })
    .returning({ id: season.id });

  return { id: row!.id, created: true };
}

async function upsertClubRow(
  db: Db,
  countryId: string,
  externalValue: string,
  name: string,
  nameLocale: LabelLocale,
  kind: (typeof club.$inferInsert)["kind"],
): Promise<{ id: string; created: boolean; labels: number; externalIds: number }> {
  const byExternal = await findEntityId(db, externalValue);
  if (byExternal) {
    const labelChanged = await upsertCatalogLabel(db, "club", byExternal, nameLocale, name);
    return { id: byExternal, created: false, labels: labelChanged ? 1 : 0, externalIds: 0 };
  }

  const [row] = await db.insert(club).values({ countryId, kind }).returning({ id: club.id });
  const id = row!.id;
  await linkExternalId(db, "club", id, externalValue);
  await upsertCatalogLabel(db, "club", id, nameLocale, name);
  return { id, created: true, labels: 1, externalIds: 1 };
}

async function upsertTeamSeasonRow(
  db: Db,
  clubId: string,
  seasonId: string,
): Promise<{ id: string; created: boolean }> {
  const existing = await db
    .select({ id: teamSeason.id })
    .from(teamSeason)
    .where(and(eq(teamSeason.clubId, clubId), eq(teamSeason.seasonId, seasonId)))
    .limit(1);

  if (existing[0]) {
    return { id: existing[0].id, created: false };
  }

  const [row] = await db
    .insert(teamSeason)
    .values({ clubId, seasonId })
    .returning({ id: teamSeason.id });

  return { id: row!.id, created: true };
}

async function upsertPlayerRow(
  db: Db,
  externalValue: string,
  name: string,
  nameLocale: LabelLocale,
): Promise<{ id: string; created: boolean; labels: number; externalIds: number }> {
  const byExternal = await findEntityId(db, externalValue);
  if (byExternal) {
    const labelChanged = await upsertCatalogLabel(db, "player", byExternal, nameLocale, name);
    return { id: byExternal, created: false, labels: labelChanged ? 1 : 0, externalIds: 0 };
  }

  const [row] = await db.insert(player).values({}).returning({ id: player.id });
  const id = row!.id;
  await linkExternalId(db, "player", id, externalValue);
  await upsertCatalogLabel(db, "player", id, nameLocale, name);
  return { id, created: true, labels: 1, externalIds: 1 };
}

async function upsertPlayerClubSeasonRow(
  db: Db,
  playerId: string,
  clubId: string,
  seasonId: string,
  squadNumber?: number,
): Promise<{ id: string; created: boolean }> {
  const existing = await db
    .select({ id: playerClubSeason.id, squadNumber: playerClubSeason.squadNumber })
    .from(playerClubSeason)
    .where(
      and(
        eq(playerClubSeason.playerId, playerId),
        eq(playerClubSeason.clubId, clubId),
        eq(playerClubSeason.seasonId, seasonId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    if (existing[0].squadNumber !== (squadNumber ?? null)) {
      await db
        .update(playerClubSeason)
        .set({ squadNumber: squadNumber ?? null })
        .where(eq(playerClubSeason.id, existing[0].id));
    }
    return { id: existing[0].id, created: false };
  }

  const [row] = await db
    .insert(playerClubSeason)
    .values({
      playerId,
      clubId,
      seasonId,
      squadNumber: squadNumber ?? null,
    })
    .returning({ id: playerClubSeason.id });

  return { id: row!.id, created: true };
}

export async function mapFacts(db: Db, facts: NormalizedFacts): Promise<MapResult> {
  const result: MapResult = {
    countries: 0,
    leagues: 0,
    seasons: 0,
    clubs: 0,
    teamSeasons: 0,
    players: 0,
    playerClubSeasons: 0,
    catalogLabels: 0,
    externalIds: 0,
  };

  const countryResult = await upsertCountry(
    db,
    facts.league.countryIso,
    facts.league.countryExternalId,
    facts.league.countryName,
  );
  if (countryResult.created) result.countries += 1;
  result.catalogLabels += countryResult.labels;
  result.externalIds += countryResult.externalIds;

  const leagueResult = await upsertLeagueRow(
    db,
    countryResult.id,
    facts.league.externalId,
    facts.league.name,
  );
  if (leagueResult.created) result.leagues += 1;
  result.catalogLabels += leagueResult.labels;
  result.externalIds += leagueResult.externalIds;

  for (const seasonData of facts.seasons) {
    const seasonResult = await upsertSeasonRow(db, leagueResult.id, seasonData);
    if (seasonResult.created) result.seasons += 1;

    for (const clubData of seasonData.clubs) {
      const clubResult = await upsertClubRow(
        db,
        countryResult.id,
        clubData.externalId,
        clubData.name,
        clubData.nameLocale,
        clubData.kind,
      );
      if (clubResult.created) result.clubs += 1;
      result.catalogLabels += clubResult.labels;
      result.externalIds += clubResult.externalIds;

      const teamSeasonResult = await upsertTeamSeasonRow(db, clubResult.id, seasonResult.id);
      if (teamSeasonResult.created) result.teamSeasons += 1;

      for (const playerData of clubData.players) {
        const playerResult = await upsertPlayerRow(
          db,
          playerData.externalId,
          playerData.name,
          playerData.nameLocale,
        );
        if (playerResult.created) result.players += 1;
        result.catalogLabels += playerResult.labels;
        result.externalIds += playerResult.externalIds;

        const pcsResult = await upsertPlayerClubSeasonRow(
          db,
          playerResult.id,
          clubResult.id,
          seasonResult.id,
          playerData.squadNumber,
        );
        if (pcsResult.created) result.playerClubSeasons += 1;
      }
    }
  }

  return result;
}
