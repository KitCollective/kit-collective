import { describe, expect, it } from "vitest";
import { catalogCompetitionIdentity, resolveCompetition } from "../src/competitions.js";
import { resolveSeasonRef } from "../src/season-ref.js";

type ExpectedLeague = {
  tmCode: string;
  slug: string;
  name: string;
  countryName: string;
  iso3166: string;
  firstSeasonLabel: string;
  aliases: string[];
};

const LEAGUES: ExpectedLeague[] = [
  {
    tmCode: "DK1",
    slug: "superligaen",
    name: "Superligaen",
    countryName: "Denmark",
    iso3166: "DK",
    firstSeasonLabel: "1991/92",
    aliases: ["superliga", "superligaen"],
  },
  {
    tmCode: "GB1",
    slug: "premier-league",
    name: "Premier League",
    countryName: "England",
    iso3166: "GB",
    firstSeasonLabel: "1992/93",
    aliases: ["premier-league", "premier league", "premierleague", "epl"],
  },
  {
    tmCode: "GB2",
    slug: "championship",
    name: "Championship",
    countryName: "England",
    iso3166: "GB",
    firstSeasonLabel: "2004/05",
    aliases: ["championship", "efl championship"],
  },
  {
    tmCode: "ES1",
    slug: "laliga",
    name: "LaLiga",
    countryName: "Spain",
    iso3166: "ES",
    firstSeasonLabel: "1928/29",
    aliases: ["laliga", "la liga", "primera division", "primera división"],
  },
  {
    tmCode: "IT1",
    slug: "serie-a",
    name: "Serie A",
    countryName: "Italy",
    iso3166: "IT",
    firstSeasonLabel: "1929/30",
    aliases: ["serie-a", "serie a", "seriea"],
  },
  {
    tmCode: "L1",
    slug: "bundesliga",
    name: "Bundesliga",
    countryName: "Germany",
    iso3166: "DE",
    firstSeasonLabel: "1963/64",
    aliases: ["bundesliga", "1. bundesliga"],
  },
  {
    tmCode: "FR1",
    slug: "ligue-1",
    name: "Ligue 1",
    countryName: "France",
    iso3166: "FR",
    firstSeasonLabel: "1932/33",
    aliases: ["ligue-1", "ligue 1", "ligue1"],
  },
  {
    tmCode: "NL1",
    slug: "eredivisie",
    name: "Eredivisie",
    countryName: "Netherlands",
    iso3166: "NL",
    firstSeasonLabel: "1956/57",
    aliases: ["eredivisie"],
  },
  {
    tmCode: "PO1",
    slug: "liga-portugal",
    name: "Liga Portugal",
    countryName: "Portugal",
    iso3166: "PT",
    firstSeasonLabel: "1934/35",
    aliases: ["liga-portugal", "liga portugal", "primeira liga", "liga nos"],
  },
  {
    tmCode: "TR1",
    slug: "super-lig",
    name: "Süper Lig",
    countryName: "Turkey",
    iso3166: "TR",
    firstSeasonLabel: "1959/60",
    aliases: ["super-lig", "super lig", "süper lig"],
  },
  {
    tmCode: "SC1",
    slug: "scottish-premiership",
    name: "Scottish Premiership",
    countryName: "Scotland",
    iso3166: "SCO",
    firstSeasonLabel: "1890/91",
    aliases: ["scottish-premiership", "scottish premiership", "spfl"],
  },
];

describe("resolveCompetition", () => {
  for (const league of LEAGUES) {
    it(`resolves ${league.tmCode} by its Transfermarkt code`, () => {
      expect(resolveCompetition(league.tmCode)?.leagueTransfermarktId).toBe(league.tmCode);
      expect(resolveCompetition(league.tmCode.toLowerCase())?.leagueTransfermarktId).toBe(
        league.tmCode,
      );
    });

    it(`resolves ${league.tmCode} by every alias`, () => {
      for (const alias of league.aliases) {
        expect(resolveCompetition(alias)?.leagueTransfermarktId).toBe(league.tmCode);
        expect(resolveCompetition(` ${alias.toUpperCase()} `)?.leagueTransfermarktId).toBe(
          league.tmCode,
        );
      }
    });
  }

  it("returns undefined for an uncatalogued competition", () => {
    expect(resolveCompetition("Allsvenskan")).toBeUndefined();
    expect(resolveCompetition("MLS")).toBeUndefined();
    expect(resolveCompetition("")).toBeUndefined();
  });

  it("keeps the Danish Superliga keys pointing at DK1, not the Turkish Süper Lig", () => {
    expect(resolveCompetition("superliga")?.leagueTransfermarktId).toBe("DK1");
    expect(resolveCompetition("superligaen")?.leagueTransfermarktId).toBe("DK1");
    expect(resolveCompetition("super lig")?.leagueTransfermarktId).toBe("TR1");
  });

  it("exposes the first-season label used by the 0001 season ref", () => {
    expect(resolveCompetition("superliga")?.firstSeasonLabel).toBe("1991/92");
    expect(resolveCompetition("championship")?.firstSeasonLabel).toBe("2004/05");
  });
});

describe("catalogCompetitionIdentity", () => {
  for (const league of LEAGUES) {
    it(`returns the full ${league.tmCode} identity from the catalog`, () => {
      for (const alias of [league.tmCode, ...league.aliases]) {
        expect(catalogCompetitionIdentity(alias)).toEqual({
          leagueTransfermarktId: league.tmCode,
          slug: league.slug,
          name: league.name,
          countryName: league.countryName,
          iso3166: league.iso3166,
          firstSeasonLabel: league.firstSeasonLabel,
        });
      }
    });
  }

  it("returns undefined for an uncatalogued competition", () => {
    expect(catalogCompetitionIdentity("Allsvenskan")).toBeUndefined();
  });

  it("only catalogues split-year leagues so startYearToLabel stays correct", () => {
    for (const league of LEAGUES) {
      expect(league.firstSeasonLabel).toMatch(/^\d{4}\/\d{2}$/);
    }
  });
});

describe("resolveSeasonRef over the catalog", () => {
  for (const league of LEAGUES) {
    it(`resolves 0001 for ${league.tmCode} without a live search`, () => {
      expect(resolveSeasonRef(league.aliases[0] ?? league.tmCode, "0001")).toBe(
        league.firstSeasonLabel,
      );
    });
  }

  it("still throws for an uncatalogued competition", () => {
    expect(() => resolveSeasonRef("Allsvenskan", "0001")).toThrow(/Unknown competition/);
  });
});
