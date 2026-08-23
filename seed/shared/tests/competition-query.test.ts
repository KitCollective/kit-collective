import { describe, expect, it } from "vitest";
import {
  pickCompetitionHit,
  type CompetitionHit,
} from "../src/competition-query.js";

const HITS: CompetitionHit[] = [
  {
    name: "Premier League",
    slug: "premier-league",
    tmCode: "GB1",
    countryName: "England",
    iso3166: "GB",
  },
  {
    name: "LaLiga",
    slug: "laliga",
    tmCode: "ES1",
    countryName: "Spain",
    iso3166: "ES",
  },
  {
    name: "Süper Lig",
    slug: "super-lig",
    tmCode: "TR1",
    countryName: "Turkey",
    iso3166: "TR",
  },
  {
    name: "Superligaen",
    slug: "superligaen",
    tmCode: "DK1",
    countryName: "Denmark",
    iso3166: "DK",
  },
];

describe("pickCompetitionHit", () => {
  it("resolves Premier League to England GB1", () => {
    const picked = pickCompetitionHit("Premier League", HITS);
    expect(picked.leagueTransfermarktId).toBe("GB1");
    expect(picked.slug).toBe("premier-league");
    expect(picked.iso3166).toBe("GB");
    expect(picked.countryName).toBe("England");
  });

  it("resolves La Liga in Spain to ES1, not another liga", () => {
    const picked = pickCompetitionHit("La Liga i Spanien", HITS);
    expect(picked.leagueTransfermarktId).toBe("ES1");
    expect(picked.iso3166).toBe("ES");
  });

  it("resolves tyrkiske Superliga to Turkey TR1, not Superligaen", () => {
    const picked = pickCompetitionHit("tyrkiske Superliga", HITS);
    expect(picked.leagueTransfermarktId).toBe("TR1");
    expect(picked.iso3166).toBe("TR");
  });

  it("resolves a Transfermarkt code when it is unique in the hits", () => {
    expect(pickCompetitionHit("GB1", HITS).leagueTransfermarktId).toBe("GB1");
  });

  it("fails with candidate names when two hits score the same", () => {
    expect(() =>
      pickCompetitionHit("Superliga", [
        HITS[2]!,
        HITS[3]!,
      ]),
    ).toThrow(/Ambiguous competition/);
  });

  it("fails when search returned no competitions", () => {
    expect(() => pickCompetitionHit("Premier League", [])).toThrow(
      /No Transfermarkt competition matched/,
    );
  });
});
