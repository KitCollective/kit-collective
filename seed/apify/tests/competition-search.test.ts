import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  competitionSearchUrl,
  parseCompetitionSearchHtml,
} from "../src/fetch/competition-search.js";

const fixture = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../fixtures/kader-html/search/competitions.html",
  ),
  "utf8",
);

describe("parseCompetitionSearchHtml", () => {
  it("reads competition name, slug, Transfermarkt code, and country", () => {
    expect(parseCompetitionSearchHtml(fixture)).toEqual([
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
    ]);
  });

  it("ignores player and club links", () => {
    const codes = parseCompetitionSearchHtml(fixture).map((hit) => hit.tmCode);
    expect(codes).not.toContain("11111");
    expect(codes).not.toContain("190");
  });
});

describe("competitionSearchUrl", () => {
  it("builds a Transfermarkt schnellsuche URL", () => {
    expect(competitionSearchUrl("Premier League")).toBe(
      "https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=Premier%20League",
    );
  });
});
