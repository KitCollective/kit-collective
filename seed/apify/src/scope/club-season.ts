import { type CompetitionSeedScope, resolveSeasonRef, type SeedScope } from "@kit/seed-shared";
import { labelToStartYear } from "../fetch/season-label.js";
import type { NormalizedFacts } from "../types.js";

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

  if (fromLabel === toLabel) {
    return resolvedPairLabel === fromLabel;
  }

  if (fromLabel === "today" || toLabel === "today") {
    return resolvedPairLabel === fromLabel || resolvedPairLabel === toLabel;
  }

  try {
    const fromYear = labelToStartYear(fromLabel);
    const toYear = labelToStartYear(toLabel);
    const labelYear = labelToStartYear(resolvedPairLabel);
    return labelYear >= fromYear && labelYear <= toYear;
  } catch {
    return resolvedPairLabel === fromLabel || resolvedPairLabel === toLabel;
  }
}

export function isPairInSeedScope(scope: SeedScope, seasonLabel: string): boolean {
  if (scope.kind === "club") {
    const resolved = resolveSeasonRef(scope.competition, scope.season);
    return seasonLabel === resolved;
  }

  return seasonLabelInCompetitionScope(scope, seasonLabel);
}
