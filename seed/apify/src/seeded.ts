import { catalogLabel, type Db, externalId, playerClubSeason, season } from "@kit/db";
import { resolveCompetition } from "@kit/seed-shared";
import { and, eq, isNotNull } from "drizzle-orm";
import { TM_SYSTEM } from "./types.js";

async function findEntityId(db: Db, value: string): Promise<string | undefined> {
  const row = await db
    .select({ entityId: externalId.entityId })
    .from(externalId)
    .where(and(eq(externalId.system, TM_SYSTEM), eq(externalId.value, value)))
    .limit(1);

  return row[0]?.entityId;
}

export async function findLeagueEntityId(db: Db, competition: string): Promise<string | undefined> {
  const competitionDef = resolveCompetition(competition);
  const candidates = new Set(
    [
      competitionDef?.leagueTransfermarktId,
      competitionDef?.leagueTransfermarktId?.toLowerCase(),
      competition,
      competition.trim().toLowerCase(),
    ].filter((value): value is string => Boolean(value)),
  );

  for (const value of candidates) {
    const entityId = await findEntityId(db, value);
    if (entityId) {
      return entityId;
    }
  }

  return undefined;
}

/**
 * Already seeded = squad with jersey numbers exists for that club-season pair.
 */
export async function isClubSeasonAlreadySeeded(
  db: Db,
  competition: string,
  clubExternalId: string,
  seasonLabel: string,
): Promise<boolean> {
  const clubEntityId = await findEntityId(db, clubExternalId);
  if (!clubEntityId) {
    return false;
  }

  const leagueEntityId = await findLeagueEntityId(db, competition);
  if (!leagueEntityId) {
    return false;
  }

  const seasonRow = await db
    .select({ id: season.id })
    .from(season)
    .where(and(eq(season.leagueId, leagueEntityId), eq(season.label, seasonLabel)))
    .limit(1);

  if (!seasonRow[0]) {
    return false;
  }

  const numberedSquad = await db
    .select({ id: playerClubSeason.id })
    .from(playerClubSeason)
    .where(
      and(
        eq(playerClubSeason.clubId, clubEntityId),
        eq(playerClubSeason.seasonId, seasonRow[0].id),
        isNotNull(playerClubSeason.squadNumber),
      ),
    )
    .limit(1);

  return numberedSquad.length > 0;
}

export async function findClubLabel(db: Db, clubExternalId: string): Promise<string | undefined> {
  const clubEntityId = await findEntityId(db, clubExternalId);
  if (!clubEntityId) {
    return undefined;
  }

  const row = await db
    .select({ text: catalogLabel.text })
    .from(catalogLabel)
    .where(
      and(
        eq(catalogLabel.entityType, "club"),
        eq(catalogLabel.entityId, clubEntityId),
        eq(catalogLabel.kind, "label"),
      ),
    )
    .limit(1);

  return row[0]?.text;
}

export { findEntityId };
