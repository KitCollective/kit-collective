import {
  type CompetitionIdentity,
  foldCompetitionText,
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

/**
 * One catalogued league. Every field is required here so bulk runs never fall
 * back to the live Transfermarkt search page for a league we already know.
 *
 * Only split-year leagues belong in this catalog: `startYearToLabel` in the
 * Apify actor mapper always emits `2015/16`-shaped labels, so calendar-year
 * competitions (Allsvenskan, Eliteserien, MLS, Brasileirao) would be labelled
 * wrong.
 */
type CatalogLeague = {
  tmCode: string;
  slug: string;
  name: string;
  countryName: string;
  iso3166: string;
  /** Oldest split-year season Transfermarkt lists for this league. */
  firstSeasonLabel: string;
  /** Extra lookup keys on top of the tm code, the slug, and the display name. */
  aliases: string[];
};

const CATALOG: CatalogLeague[] = [
  {
    tmCode: "DK1",
    slug: "superligaen",
    name: "Superligaen",
    countryName: "Denmark",
    iso3166: "DK",
    firstSeasonLabel: "1991/92",
    aliases: ["superliga", "danish superliga"],
  },
  {
    tmCode: "GB1",
    slug: "premier-league",
    name: "Premier League",
    countryName: "England",
    iso3166: "GB",
    firstSeasonLabel: "1992/93",
    aliases: ["epl", "english premier league"],
  },
  {
    tmCode: "GB2",
    slug: "championship",
    name: "Championship",
    countryName: "England",
    iso3166: "GB",
    firstSeasonLabel: "2004/05",
    aliases: ["efl championship", "english championship"],
  },
  {
    tmCode: "ES1",
    slug: "laliga",
    name: "LaLiga",
    countryName: "Spain",
    iso3166: "ES",
    firstSeasonLabel: "1928/29",
    aliases: ["la liga", "la-liga", "primera division", "primera división", "spanish la liga"],
  },
  {
    tmCode: "IT1",
    slug: "serie-a",
    name: "Serie A",
    countryName: "Italy",
    iso3166: "IT",
    firstSeasonLabel: "1929/30",
    aliases: ["italian serie a"],
  },
  {
    tmCode: "L1",
    slug: "bundesliga",
    name: "Bundesliga",
    countryName: "Germany",
    iso3166: "DE",
    firstSeasonLabel: "1963/64",
    aliases: ["1. bundesliga", "1 bundesliga", "german bundesliga"],
  },
  {
    tmCode: "FR1",
    slug: "ligue-1",
    name: "Ligue 1",
    countryName: "France",
    iso3166: "FR",
    firstSeasonLabel: "1932/33",
    aliases: ["french ligue 1"],
  },
  {
    tmCode: "NL1",
    slug: "eredivisie",
    name: "Eredivisie",
    countryName: "Netherlands",
    iso3166: "NL",
    firstSeasonLabel: "1956/57",
    aliases: ["dutch eredivisie"],
  },
  {
    tmCode: "PO1",
    slug: "liga-portugal",
    name: "Liga Portugal",
    countryName: "Portugal",
    iso3166: "PT",
    firstSeasonLabel: "1934/35",
    aliases: ["primeira liga", "primeira-liga", "liga nos", "portuguese primeira liga"],
  },
  {
    tmCode: "TR1",
    slug: "super-lig",
    name: "Süper Lig",
    countryName: "Turkey",
    iso3166: "TR",
    // Transfermarkt also lists 1958, but labels it "1959" — a calendar-year
    // season that `startYearToLabel` cannot represent.
    firstSeasonLabel: "1959/60",
    aliases: ["süper-lig", "turkish super lig"],
  },
  {
    tmCode: "SC1",
    slug: "scottish-premiership",
    name: "Scottish Premiership",
    countryName: "Scotland",
    iso3166: "SCO",
    firstSeasonLabel: "1890/91",
    aliases: ["spfl", "spfl premiership", "scottish premier league"],
  },
];

/**
 * Accent-folded lookup key. `foldCompetitionText` keeps spaces and hyphens, so
 * `süper lig` and `Süper Lig` collapse onto the same key while the existing
 * ASCII keys (`dk1`, `superliga`, `championship`) are untouched.
 */
function lookupKey(value: string): string {
  return foldCompetitionText(value.trim()).trim();
}

function aliasKeys(league: CatalogLeague): string[] {
  return [
    league.tmCode,
    league.slug,
    league.slug.replaceAll("-", " "),
    league.slug.replaceAll("-", ""),
    league.name,
    league.name.replaceAll(" ", ""),
    ...league.aliases,
  ];
}

function buildCompetitions(catalog: CatalogLeague[]): Map<string, CompetitionDefinition> {
  const table = new Map<string, CompetitionDefinition>();

  for (const league of catalog) {
    const definition: CompetitionDefinition = {
      leagueTransfermarktId: league.tmCode,
      firstSeasonLabel: league.firstSeasonLabel,
      slug: league.slug,
      name: league.name,
      countryName: league.countryName,
      iso3166: league.iso3166,
    };

    for (const alias of aliasKeys(league)) {
      const key = lookupKey(alias);
      if (!key) {
        continue;
      }
      const clash = table.get(key);
      if (clash && clash.leagueTransfermarktId !== league.tmCode) {
        throw new Error(
          `Competition alias "${key}" maps to both ${clash.leagueTransfermarktId} and ${league.tmCode}`,
        );
      }
      table.set(key, definition);
    }
  }

  return table;
}

const COMPETITIONS: Map<string, CompetitionDefinition> = buildCompetitions(CATALOG);

export function resolveCompetition(name: string): CompetitionDefinition | undefined {
  return COMPETITIONS.get(lookupKey(name));
}

export function catalogCompetitionIdentity(query: string): CompetitionIdentity | undefined {
  const def = resolveCompetition(query);
  if (!def) {
    return undefined;
  }

  // Every catalogued league carries its own slug, country, and ISO code; these
  // fallbacks only cover a definition that is missing one.
  const countryName = def.countryName ?? "Unknown";

  return {
    leagueTransfermarktId: def.leagueTransfermarktId,
    slug: def.slug ?? def.leagueTransfermarktId.toLowerCase(),
    name: def.name ?? query.trim(),
    countryName,
    iso3166: def.iso3166 ?? iso3166ForCountryName(countryName) ?? "XX",
    firstSeasonLabel: def.firstSeasonLabel,
  };
}
