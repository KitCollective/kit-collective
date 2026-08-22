import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  parseCompetitionSeasonHtml,
  parseKaderHtml,
  parsePlayerProfileHtml,
} from "../src/fetch/kader-html-parser.js";

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/kader-html",
);

function readFixture(relativePath: string): string {
  return readFileSync(path.join(fixturesDir, relativePath), "utf8");
}

describe("kader HTML parser", () => {
  it("parses clubs from a competition season page", () => {
    const clubs = parseCompetitionSeasonHtml(readFixture("competitions/DK1-2015.html"));
    expect(clubs).toEqual([
      {
        clubId: "190",
        clubName: "FC Copenhagen",
        clubUrl: "/fc-copenhagen/startseite/verein/190",
      },
      {
        clubId: "191",
        clubName: "Brondby IF",
        clubUrl: "/brondby-if/startseite/verein/191",
      },
    ]);
  });

  it("parses squad rows with jersey numbers from kader plus/1 HTML", () => {
    const { squadRows, warnings } = parseKaderHtml(
      readFixture("kader/190-2015.html"),
      "190",
      "FC Copenhagen",
      2015,
    );

    expect(warnings).toHaveLength(0);
    expect(squadRows).toEqual([
      {
        playerId: "11111",
        playerName: "Jonas Wind",
        shirtNumber: 23,
        clubId: "190",
        clubName: "FC Copenhagen",
        season: 2015,
      },
      {
        playerId: "11112",
        playerName: "Victor Nelsson",
        shirtNumber: 4,
        clubId: "190",
        clubName: "FC Copenhagen",
        season: 2015,
      },
    ]);
  });

  it("warns when a kader row is missing a jersey number", () => {
    const { warnings } = parseKaderHtml(readFixture("kader/191-2015.html"), "191");
    expect(warnings).toEqual([
      {
        kind: "missing_jersey_number",
        playerId: "99999",
        playerName: "Rasmus Hojlund",
        clubId: "191",
      },
    ]);
  });

  it("parses shirt number from a player profile page", () => {
    const profile = parsePlayerProfileHtml(readFixture("profiles/player-99999.html"), "99999");
    expect(profile).toEqual({
      playerId: "99999",
      playerName: "Rasmus Hojlund",
      shirtNumber: 9,
    });
  });
});
