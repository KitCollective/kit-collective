import { type CompetitionSeedScope, resolveSeasonRef, type SeedScope } from "@kit/seed-shared";
import { labelToStartYear } from "../fetch/season-label.js";
import type { NormalizedFacts } from "../types.js";

function seasonRefToStartYear(ref: string): number {
  if (ref === "today") {
    throw new Error("today is not a comparable season label");
  }

  if (/^\d{4}$/.test(ref)) {
    return Number.parseInt(ref, 10);
  }

  return labelToStartYear(ref);
}

export type ClubSeasonScope = {
  seasonLabel: string;
  clubExternalId: string;
};

/**
 * Keep only the club-season slice that matches the requested pair before mapping.
 * Prevents mislabeled fetch payloads from writing into another season row.
 */
export function filterFactsToClubSeason(
  facts: NormalizedFacts,
  scope: ClubSeasonScope,
): NormalizedFacts {
  const seasons = facts.seasons
    .filter((season) => season.label === scope.seasonLabel)
    .map((season) => ({
      ...season,
      clubs: season.clubs.filter((club) => club.externalId === scope.clubExternalId),
    }))
    .filter((season) => season.clubs.length > 0);

  return {
    league: facts.league,
    seasons,
  };
}

export function seasonLabelInCompetitionScope(
  scope: CompetitionSeedScope,
  seasonLabel: string,
): boolean {
  const fromLabel = resolveSeasonRef(scope.competition, scope.fromSeason);
  const toLabel =
    scope.toSeason === "today" ? "today" : resolveSeasonRef(scope.competition, scope.toSeason);
  const resolvedPairLabel = resolveSeasonRef(scope.competition, seasonLabel);

  if (resolvedPairLabel === fromLabel || resolvedPairLabel === toLabel) {
    return true;
  }

  if (fromLabel === "today" || toLabel === "today") {
    return false;
  }

  try {
    const fromYear = seasonRefToStartYear(fromLabel);
    const toYear = seasonRefToStartYear(toLabel);
    const labelYear = seasonRefToStartYear(resolvedPairLabel);
    return labelYear >= fromYear && labelYear <= toYear;
  } catch {
    return false;
  }
}

export function isPairInSeedScope(scope: SeedScope, seasonLabel: string): boolean {
  if (scope.kind === "club") {
    const resolved = resolveSeasonRef(scope.competition, scope.season);
    return seasonLabel === resolved;
  }

  if (scope.kind === "national_team") {
    return seasonLabel === scope.season.trim();
  }

  return seasonLabelInCompetitionScope(scope, seasonLabel);
}
