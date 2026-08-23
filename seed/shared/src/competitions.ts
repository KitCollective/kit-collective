import {
  type CompetitionIdentity,
  iso3166ForCountryName,
} from "./competition-query.js";

export type CompetitionDefinition = {
  /** Transfermarkt league id used for season external ids in Apify seed. */
  leagueTransfermarktId: string;
  /** Label of the first season ("0001" resolves to this). */
  firstSeasonLabel?: string;
  slug?: string;
  name?: string;
  countryName?: string;
  iso3166?: string;
};

const COMPETITIONS: Record<string, CompetitionDefinition> = {
  superliga: {
    leagueTransfermarktId: "DK1",
    firstSeasonLabel: "1991/92",
    slug: "superligaen",
    name: "Superligaen",
    countryName: "Denmark",
    iso3166: "DK",
  },
  superligaen: {
    leagueTransfermarktId: "DK1",
    firstSeasonLabel: "1991/92",
    slug: "superligaen",
    name: "Superligaen",
    countryName: "Denmark",
    iso3166: "DK",
  },
  dk1: {
    leagueTransfermarktId: "DK1",
    firstSeasonLabel: "1991/92",
    slug: "superligaen",
    name: "Superligaen",
    countryName: "Denmark",
    iso3166: "DK",
  },
  championship: {
    leagueTransfermarktId: "GB2",
    firstSeasonLabel: "2004/05",
    slug: "championship",
    name: "Championship",
    countryName: "England",
    iso3166: "GB",
  },
};

export function resolveCompetition(name: string): CompetitionDefinition | undefined {
  const key = name.trim().toLowerCase();
  return COMPETITIONS[key];
}

function defaultSlug(tmCode: string): string {
  return tmCode === "DK1" ? "superligaen" : tmCode.toLowerCase();
}

export function catalogCompetitionIdentity(query: string): CompetitionIdentity | undefined {
  const def = resolveCompetition(query);
  if (!def) {
    return undefined;
  }

  const countryName =
    def.countryName ?? (def.leagueTransfermarktId === "DK1" ? "Denmark" : "England");

  return {
    leagueTransfermarktId: def.leagueTransfermarktId,
    slug: def.slug ?? defaultSlug(def.leagueTransfermarktId),
    name: def.name ?? query.trim(),
    countryName,
    iso3166: def.iso3166 ?? iso3166ForCountryName(countryName) ?? "XX",
    firstSeasonLabel: def.firstSeasonLabel,
  };
}
