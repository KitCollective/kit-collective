import { describe, expect, it } from "vitest";
import {
  type CompetitionHit,
  pickCompetitionHit,
  searchQueryForCompetition,
} from "../src/competition-query.js";

const ENGLAND_PREMIER_LEAGUE: CompetitionHit = {
  name: "Premier League",
  slug: "premier-league",
  tmCode: "GB1",
  countryName: "England",
  iso3166: "GB",
};

const LALIGA: CompetitionHit = {
  name: "LaLiga",
  slug: "laliga",
  tmCode: "ES1",
  countryName: "Spain",
  iso3166: "ES",
};

const SUPER_LIG: CompetitionHit = {
  name: "Süper Lig",
  slug: "super-lig",
  tmCode: "TR1",
  countryName: "Turkey",
  iso3166: "TR",
};

const SUPERLIGAEN: CompetitionHit = {
  name: "Superligaen",
  slug: "superligaen",
  tmCode: "DK1",
  countryName: "Denmark",
  iso3166: "DK",
};

const HITS: CompetitionHit[] = [ENGLAND_PREMIER_LEAGUE, LALIGA, SUPER_LIG, SUPERLIGAEN];

describe("searchQueryForCompetition", () => {
  it("strips Spain from La Liga i Spanien so Transfermarkt can search La Liga", () => {
    expect(searchQueryForCompetition("La Liga i Spanien")).toBe("La Liga");
  });

  it("maps tyrkiske Superliga to Super Lig for Transfermarkt search", () => {
    expect(searchQueryForCompetition("tyrkiske Superliga")).toBe("Super Lig");
  });

  it("keeps Premier League as the search string", () => {
    expect(searchQueryForCompetition("Premier League")).toBe("Premier League");
  });
});

describe("pickCompetitionHit", () => {
  it("prefers the England Premier League slug over Armenia's Premier League", () => {
    const picked = pickCompetitionHit("Premier League", [
      ENGLAND_PREMIER_LEAGUE,
      {
        name: "Premier League",
        slug: "bardsragujn-chumb",
        tmCode: "ARM1",
        countryName: "Armenia",
        iso3166: "AM",
      },
    ]);
    expect(picked.leagueTransfermarktId).toBe("GB1");
  });

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

  it("matches Transfermarkt's Türkiye flag title to Turkey", () => {
    const picked = pickCompetitionHit("tyrkiske Superliga", [
      {
        name: "Süper Lig",
        slug: "super-lig",
        tmCode: "TR1",
        countryName: "Türkiye",
        iso3166: "TR",
      },
      SUPERLIGAEN,
    ]);
    expect(picked.leagueTransfermarktId).toBe("TR1");
  });

  it("resolves a Transfermarkt code when it is unique in the hits", () => {
    expect(pickCompetitionHit("GB1", HITS).leagueTransfermarktId).toBe("GB1");
  });

  it("fails with candidate names when two hits score the same", () => {
    expect(() => pickCompetitionHit("Superliga", [SUPER_LIG, SUPERLIGAEN])).toThrow(
      /Ambiguous competition/,
    );
  });

  it("fails when search returned no competitions", () => {
    expect(() => pickCompetitionHit("Premier League", [])).toThrow(
      /No Transfermarkt competition matched/,
    );
  });

  it("fails when a country word is present but no hit is in that country", () => {
    expect(() => pickCompetitionHit("tyrkiske Superliga", [SUPERLIGAEN])).toThrow(
      /tyrkiske Superliga/,
    );
  });
});
