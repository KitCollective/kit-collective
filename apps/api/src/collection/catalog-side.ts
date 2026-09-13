import type { Db } from "@kit/db";
import { club, kit, nationalTeam, nationalTeamSeason, season, teamSeason } from "@kit/db";
import { BadRequestException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";

export type CatalogJerseySide =
  | {
      kind: "club";
      clubId: string;
      nationalTeamId: null;
      countryId: string;
    }
  | {
      kind: "national_team";
      clubId: null;
      nationalTeamId: string;
      countryId: string;
    };

export async function resolveCatalogJerseySide(
  db: Db,
  input: { clubId?: string; nationalTeamId?: string },
): Promise<CatalogJerseySide> {
  if (input.clubId && input.nationalTeamId) {
    throw new BadRequestException("Exactly one of clubId or nationalTeamId is required");
  }

  if (input.clubId) {
    const [clubRow] = await db
      .select({ id: club.id, countryId: club.countryId })
      .from(club)
      .where(eq(club.id, input.clubId))
      .limit(1);
    if (!clubRow) {
      throw new BadRequestException("clubId is not a catalog club");
    }
    return {
      kind: "club",
      clubId: clubRow.id,
      nationalTeamId: null,
      countryId: clubRow.countryId,
    };
  }

  if (input.nationalTeamId) {
    const [nationalTeamRow] = await db
      .select({ id: nationalTeam.id, countryId: nationalTeam.countryId })
      .from(nationalTeam)
      .where(eq(nationalTeam.id, input.nationalTeamId))
      .limit(1);
    if (!nationalTeamRow) {
      throw new BadRequestException("nationalTeamId is not a catalog national team");
    }
    return {
      kind: "national_team",
      clubId: null,
      nationalTeamId: nationalTeamRow.id,
      countryId: nationalTeamRow.countryId,
    };
  }

  throw new BadRequestException("Exactly one of clubId or nationalTeamId is required");
}

export async function assertSeasonLinkedToSide(
  db: Db,
  side: CatalogJerseySide,
  seasonId: string,
): Promise<{ id: string; label: string; leagueId: string | null }> {
  const [seasonRow] = await db
    .select({ id: season.id, label: season.label, leagueId: season.leagueId })
    .from(season)
    .where(eq(season.id, seasonId))
    .limit(1);

  if (!seasonRow) {
    throw new BadRequestException("seasonId is not a catalog season");
  }

  if (side.kind === "club") {
    const [teamSeasonRow] = await db
      .select({ id: teamSeason.id })
      .from(teamSeason)
      .where(and(eq(teamSeason.clubId, side.clubId), eq(teamSeason.seasonId, seasonId)))
      .limit(1);
    if (!teamSeasonRow) {
      throw new BadRequestException("clubId and seasonId are not linked in TeamSeason");
    }
    return seasonRow;
  }

  const [nationalTeamSeasonRow] = await db
    .select({ id: nationalTeamSeason.id })
    .from(nationalTeamSeason)
    .where(
      and(
        eq(nationalTeamSeason.nationalTeamId, side.nationalTeamId),
        eq(nationalTeamSeason.seasonId, seasonId),
      ),
    )
    .limit(1);

  if (nationalTeamSeasonRow) {
    return seasonRow;
  }

  const [kitSeasonRow] = await db
    .select({ id: kit.id })
    .from(kit)
    .where(and(eq(kit.nationalTeamId, side.nationalTeamId), eq(kit.seasonId, seasonId)))
    .limit(1);

  if (!kitSeasonRow) {
    throw new BadRequestException(
      "nationalTeamId and seasonId are not linked in NationalTeamSeason",
    );
  }

  return seasonRow;
}

export function uniqueNonNullIds(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((id): id is string => typeof id === "string"))];
}

export function discoverJerseySideFields(row: {
  clubId: string | null;
  nationalTeamId?: string | null;
  clubLabel?: string | null;
  nationalTeamLabel?: string | null;
}): { clubId?: string; nationalTeamId?: string; clubLabel: string } | null {
  if (row.clubId && row.clubLabel) {
    return { clubId: row.clubId, clubLabel: row.clubLabel };
  }
  if (row.nationalTeamId && row.nationalTeamLabel) {
    return {
      nationalTeamId: row.nationalTeamId,
      clubLabel: row.nationalTeamLabel,
    };
  }
  return null;
}

export function discoverJerseySideFromLabels(
  row: { clubId: string | null; nationalTeamId?: string | null },
  clubLabels: Map<string, string>,
  nationalTeamLabels: Map<string, string>,
): { clubId?: string; nationalTeamId?: string; clubLabel: string } | null {
  return discoverJerseySideFields({
    clubId: row.clubId,
    nationalTeamId: row.nationalTeamId,
    clubLabel: row.clubId ? (clubLabels.get(row.clubId) ?? null) : null,
    nationalTeamLabel: row.nationalTeamId
      ? (nationalTeamLabels.get(row.nationalTeamId) ?? null)
      : null,
  });
}
