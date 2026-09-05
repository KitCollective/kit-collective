import { type Db, playerClubSeason, season } from "@kit/db";
import { resolveSeasonRef, type SeedScope } from "@kit/seed-shared";
import { eq, sql } from "drizzle-orm";
import { labelToStartYear, startYearToLabel } from "./fetch/season-label.js";
import { findLeagueEntityId } from "./seeded.js";

export interface SeasonPcsSnapshot {
  clubs: number;
  playerClubSeasons: number;
  jerseyNumbers: number;
  fingerprint: string | null;
}

export class SeedScopeIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedScopeIsolationError";
  }
}

function seasonRefToScopeLabel(ref: string): string {
  const bareYear = /^(\d{4})$/.exec(ref);
  if (bareYear?.[1]) {
    return startYearToLabel(Number.parseInt(bareYear[1], 10));
  }
  return ref;
}

function seasonRefToStartYear(ref: string): number {
  const bareYear = /^(\d{4})$/.exec(ref);
  if (bareYear?.[1]) {
    return Number.parseInt(bareYear[1], 10);
  }
  return labelToStartYear(ref);
}

function enumerateSeasonLabels(
  competition: string,
  fromSeason: string,
  toSeason: string,
): string[] {
  const fromLabel = resolveSeasonRef(competition, fromSeason);
  const toLabel = toSeason === "today" ? "today" : resolveSeasonRef(competition, toSeason);

  if (fromLabel === "today" || toLabel === "today") {
    throw new SeedScopeIsolationError(
      "Season scope isolation requires explicit season labels (today is not supported)",
    );
  }

  if (fromLabel === toLabel) {
    return [seasonRefToScopeLabel(fromLabel)];
  }

  const splitYearPattern = /^\d{4}\/\d{2}$/;
  if (!splitYearPattern.test(fromLabel) && !/^\d{4}$/.test(fromLabel)) {
    throw new SeedScopeIsolationError(
      `Cannot enumerate season range starting at ${fromLabel}; use explicit 4-digit season labels`,
    );
  }
  if (!splitYearPattern.test(toLabel) && !/^\d{4}$/.test(toLabel)) {
    throw new SeedScopeIsolationError(
      `Cannot enumerate season range ending at ${toLabel}; use explicit 4-digit season labels`,
    );
  }

  const fromYear = seasonRefToStartYear(fromLabel);
  const toYear = seasonRefToStartYear(toLabel);
  if (fromYear > toYear) {
    throw new SeedScopeIsolationError(`from-season ${fromSeason} is after to-season ${toSeason}`);
  }

  const labels: string[] = [];
  for (let year = fromYear; year <= toYear; year += 1) {
    labels.push(startYearToLabel(year));
  }
  return labels;
}

export function resolveScopeSeasonLabels(scope: SeedScope): ReadonlySet<string> {
  if (scope.kind === "club") {
    return new Set([seasonRefToScopeLabel(resolveSeasonRef(scope.competition, scope.season))]);
  }
  if (scope.kind === "national_team") {
    throw new Error(
      "NationalTeam walk scope belongs to @kit/seed-fkapi; @kit/seed-apify only walks club/competition seasons",
    );
  }
  return new Set(enumerateSeasonLabels(scope.competition, scope.fromSeason, scope.toSeason));
}

export function assertPairsInScope(
  pairs: ReadonlyArray<{ clubExternalId: string; seasonLabel: string }>,
  allowedSeasonLabels: ReadonlySet<string>,
): void {
  for (const pair of pairs) {
    if (!allowedSeasonLabels.has(pair.seasonLabel)) {
      throw new SeedScopeIsolationError(
        `Club-season pair ${pair.clubExternalId}@${pair.seasonLabel} is outside requested scope (${[...allowedSeasonLabels].join(", ")})`,
      );
    }
  }
}

export async function snapshotSeasonPcsByLabel(
  db: Db,
  competition: string,
): Promise<Map<string, SeasonPcsSnapshot>> {
  const leagueEntityId = await findLeagueEntityId(db, competition);
  if (!leagueEntityId) {
    return new Map();
  }

  const rows = await db
    .select({
      label: season.label,
      clubs: sql<number>`count(distinct ${playerClubSeason.clubId})::int`,
      playerClubSeasons: sql<number>`count(${playerClubSeason.id})::int`,
      jerseyNumbers: sql<number>`count(${playerClubSeason.id}) filter (where ${playerClubSeason.squadNumber} is not null)::int`,
      fingerprint: sql<
        string | null
      >`md5(coalesce(string_agg(${playerClubSeason.id}::text, ',' order by ${playerClubSeason.id}), ''))`,
    })
    .from(season)
    .leftJoin(playerClubSeason, eq(playerClubSeason.seasonId, season.id))
    .where(eq(season.leagueId, leagueEntityId))
    .groupBy(season.label);

  const snapshots = new Map<string, SeasonPcsSnapshot>();
  for (const row of rows) {
    snapshots.set(row.label, {
      clubs: row.clubs,
      playerClubSeasons: row.playerClubSeasons,
      jerseyNumbers: row.jerseyNumbers,
      fingerprint: row.fingerprint,
    });
  }
  return snapshots;
}

export function assertOutOfScopeSeasonsUnchanged(
  before: ReadonlyMap<string, SeasonPcsSnapshot>,
  after: ReadonlyMap<string, SeasonPcsSnapshot>,
  inScopeSeasonLabels: ReadonlySet<string>,
): void {
  const labels = new Set([...before.keys(), ...after.keys()]);
  for (const label of labels) {
    if (inScopeSeasonLabels.has(label)) {
      continue;
    }
    const prior = before.get(label);
    const next = after.get(label);
    if (!prior && !next) {
      continue;
    }
    if (
      prior?.clubs !== next?.clubs ||
      prior?.playerClubSeasons !== next?.playerClubSeasons ||
      prior?.jerseyNumbers !== next?.jerseyNumbers ||
      prior?.fingerprint !== next?.fingerprint
    ) {
      throw new SeedScopeIsolationError(
        `Out-of-scope season ${label} changed during seed run (before=${formatSnapshot(prior)} after=${formatSnapshot(next)})`,
      );
    }
  }
}

function formatSnapshot(snapshot: SeasonPcsSnapshot | undefined): string {
  if (!snapshot) {
    return "none";
  }
  return `${snapshot.clubs} clubs / ${snapshot.playerClubSeasons} pcs / ${snapshot.jerseyNumbers} jersey`;
}

export function assertFactsSeasonScope(
  seasonLabels: ReadonlyArray<string>,
  allowedSeasonLabels: ReadonlySet<string>,
): void {
  for (const label of seasonLabels) {
    if (!allowedSeasonLabels.has(label)) {
      throw new SeedScopeIsolationError(
        `Mapped facts include season ${label} outside allowed scope (${[...allowedSeasonLabels].join(", ")})`,
      );
    }
  }
}
