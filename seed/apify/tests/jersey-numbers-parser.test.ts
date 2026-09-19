import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseJerseyNumbersHtml } from "../src/fetch/jersey-numbers-parser.js";
import { playerJerseyNumbersUrl } from "../src/fetch/kader-fetch-adapter.js";
import { resolveKaderHtmlCacheKey } from "../src/fetch/kader-html-live-cache.js";
import { widenSeasonLabel } from "../src/fetch/season-label.js";

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/kader-html/jersey-numbers",
);

async function parseFixture(playerId: string) {
  const html = await readFile(path.join(fixturesDir, `player-${playerId}.html`), "utf8");
  return parseJerseyNumbersHtml(html, playerId);
}

describe("jersey number history URL and cache key", () => {
  it("addresses the career page, not the profile page", () => {
    expect(playerJerseyNumbersUrl("3333")).toBe(
      "https://www.transfermarkt.com/-/rueckennummern/spieler/3333",
    );
  });

  it("caches the career page under its own kind", () => {
    expect(resolveKaderHtmlCacheKey(playerJerseyNumbersUrl("3333"))).toEqual({
      kind: "jersey_numbers",
      relativePath: path.join("jersey-numbers", "player-3333.html"),
    });
  });

  it("does not share a cache key with the profile page for the same player", () => {
    const history = resolveKaderHtmlCacheKey(playerJerseyNumbersUrl("3333"));
    const profile = resolveKaderHtmlCacheKey("https://www.transfermarkt.com/-/profil/spieler/3333");
    expect(profile).toEqual({
      kind: "profile",
      relativePath: path.join("profiles", "player-3333.html"),
    });
    expect(history?.relativePath).not.toBe(profile?.relativePath);
  });
});

describe("widenSeasonLabel", () => {
  it("widens the two-digit career-table label", () => {
    expect(widenSeasonLabel("25/26")).toBe("2025/26");
    expect(widenSeasonLabel("00/01")).toBe("2000/01");
  });

  it("reads a two-digit year of 50 or more as the previous century", () => {
    expect(widenSeasonLabel("98/99")).toBe("1998/99");
    expect(widenSeasonLabel("99/00")).toBe("1999/00");
  });

  it("passes through the four-digit split and calendar forms", () => {
    expect(widenSeasonLabel("2010/11")).toBe("2010/11");
    expect(widenSeasonLabel("2010")).toBe("2010");
  });

  it("returns undefined for anything that is not a season", () => {
    expect(widenSeasonLabel("")).toBeUndefined();
    expect(widenSeasonLabel("-")).toBeUndefined();
    expect(widenSeasonLabel("Season")).toBeUndefined();
  });
});

describe("parseJerseyNumbersHtml", () => {
  it("reads club rows and national-team rows out of the two boxes", async () => {
    const parsed = await parseFixture("3333");

    expect(parsed.playerId).toBe("3333");
    expect(parsed.warnings).toEqual([]);
    expect(parsed.rows[0]).toEqual({
      seasonLabel: "2025/26",
      rawSeasonLabel: "25/26",
      sideExternalId: "1237",
      sideName: "Brighton & Hove Albion",
      side: "club",
      squadNumber: 20,
    });

    const nationalRows = parsed.rows.filter((row) => row.side === "national_team");
    expect(nationalRows.length).toBeGreaterThan(0);
    expect(nationalRows.every((row) => row.sideExternalId === "3299")).toBe(true);
    expect(nationalRows.every((row) => row.sideName === "England")).toBe(true);
  });

  it("keeps every number a player wore for one side in one season", async () => {
    const parsed = await parseFixture("3333");

    const england2014 = parsed.rows.filter(
      (row) => row.side === "national_team" && row.seasonLabel === "2014/15",
    );
    expect(england2014.map((row) => row.squadNumber)).toEqual([4, 7, 16]);
  });

  it("keeps both sides of a mid-season transfer under one season", async () => {
    const parsed = await parseFixture("53622");

    const seasonRows = parsed.rows.filter(
      (row) => row.side === "club" && row.seasonLabel === "2025/26",
    );
    expect(seasonRows.map((row) => [row.sideName, row.squadNumber])).toEqual([
      ["Galatasaray", 20],
      ["Manchester City", 19],
    ]);
  });

  it("returns no national-team rows when that box says no entries available", async () => {
    const parsed = await parseFixture("1197");

    expect(parsed.rows.every((row) => row.side === "club")).toBe(true);
    expect(parsed.warnings).toEqual([]);
  });

  it("widens a 1990s career row", async () => {
    const parsed = await parseFixture("1197");

    const oldest = parsed.rows.at(-1);
    expect(oldest).toMatchObject({
      rawSeasonLabel: "98/99",
      seasonLabel: "1998/99",
      sideName: "Bröndby IF",
      squadNumber: 31,
    });
  });

  it("treats reserve and youth club sides as clubs and national youth sides as national teams", async () => {
    const parsed = await parseFixture("88373");

    expect(parsed.rows.find((row) => row.sideExternalId === "8815")).toMatchObject({
      sideName: "Bröndby IF U19",
      side: "club",
    });
    expect(parsed.rows.find((row) => row.sideExternalId === "20901")).toMatchObject({
      sideName: "Denmark U17",
      side: "national_team",
    });
  });

  it("parses a page with no history at all to zero rows", async () => {
    const parsed = await parseFixture("nohistory");

    expect(parsed.rows).toEqual([]);
    expect(parsed.warnings).toEqual([]);
  });

  it("warns instead of throwing when a row has no side link", () => {
    const parsed = parseJerseyNumbersHtml(
      `<div class="box"><h2 class="content-box-headline">Squad number history</h2>
       <table class="items"><tbody>
       <tr><td class="zentriert">25/26</td><td>Unknown</td><td class="zentriert hauptlink">9</td></tr>
       </tbody></table></div>`,
      "4242",
    );

    expect(parsed.rows).toEqual([]);
    expect(parsed.warnings).toEqual([
      { kind: "missing_side", playerId: "4242", rawSeasonLabel: "25/26" },
    ]);
  });

  it("warns and drops a row whose season cell is not a season", () => {
    const parsed = parseJerseyNumbersHtml(
      `<div class="box"><h2 class="content-box-headline">Squad number history</h2>
       <table class="items"><tbody>
       <tr><td class="zentriert">-</td>
       <td><a href="/x/startseite/verein/31/saison_id/2025"><img src="https://img.a.transfermarkt.technology/wappen/tiny/31.png" /></a></td>
       <td><a href="/x/startseite/verein/31/saison_id/2025">Liverpool FC</a></td>
       <td class="zentriert hauptlink">7</td></tr>
       </tbody></table></div>`,
      "4242",
    );

    expect(parsed.rows).toEqual([]);
    expect(parsed.warnings).toEqual([
      { kind: "unparsed_season", playerId: "4242", rawSeasonLabel: "-" },
    ]);
  });

  it("records a dash number cell as a missing number rather than zero", () => {
    const parsed = parseJerseyNumbersHtml(
      `<div class="box"><h2 class="content-box-headline">Squad number history</h2>
       <table class="items"><tbody>
       <tr><td class="zentriert">25/26</td>
       <td><a href="/x/startseite/verein/31/saison_id/2025"><img src="https://img.a.transfermarkt.technology/wappen/tiny/31.png" /></a></td>
       <td><a href="/x/startseite/verein/31/saison_id/2025">Liverpool FC</a></td>
       <td class="zentriert hauptlink">-</td></tr>
       </tbody></table></div>`,
      "4242",
    );

    expect(parsed.rows).toEqual([
      {
        seasonLabel: "2025/26",
        rawSeasonLabel: "25/26",
        sideExternalId: "31",
        sideName: "Liverpool FC",
        side: "club",
        squadNumber: null,
      },
    ]);
    expect(parsed.warnings).toEqual([
      { kind: "missing_number", playerId: "4242", seasonLabel: "2025/26", sideExternalId: "31" },
    ]);
  });

  it("ignores boxes that are not squad-number history", () => {
    const parsed = parseJerseyNumbersHtml(
      `<div class="box"><h2 class="content-box-headline">Transfer history</h2>
       <table class="items"><tbody>
       <tr><td class="zentriert">25/26</td>
       <td><a href="/x/startseite/verein/31/saison_id/2025">Liverpool FC</a></td>
       <td class="zentriert hauptlink">7</td></tr>
       </tbody></table></div>`,
      "4242",
    );

    expect(parsed.rows).toEqual([]);
  });
});
