import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  parseClubFactsHtml,
  parseCompetitionSeasonHtml,
  parseEnglishDate,
  parseHonoursHtml,
  parseKaderHtml,
  parsePlayerProfileHtml,
} from "../src/fetch/kader-html-parser.js";
import { nationalityIsoFromName } from "../src/fetch/nationality-iso.js";
import { squadRowMissingBodyFacts, squadRowNeedsProfile } from "../src/fetch/squad-profile-hop.js";

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

  it("parses jersey numbers with a leading hash from plus/1 HTML", () => {
    const { squadRows, warnings } = parseKaderHtml(
      readFixture("kader/192-2015.html"),
      "192",
      "Hash Club",
      2015,
    );

    expect(warnings).toHaveLength(0);
    expect(squadRows[0]?.shirtNumber).toBe(10);
  });

  it("parses plus/1 body facts from a Rich kader row", () => {
    const { squadRows, warnings } = parseKaderHtml(
      readFixture("kader/190-2010.html"),
      "190",
      "FC Copenhagen",
      2010,
    );

    expect(warnings).toHaveLength(0);
    expect(squadRows[0]).toMatchObject({
      playerId: "11110",
      playerName: "Cesar Santin",
      shirtNumber: 10,
      position: "Centre-Forward",
      dateOfBirth: "1981-02-24",
      nationalityIso: "BR",
      heightCm: 174,
      preferredFoot: "right",
      portraitSrc: "/portraits/11110.jpg",
    });
    expect(squadRows[1]).toMatchObject({
      playerId: "11113",
      nationalityIso: "DK",
      heightCm: 184,
      preferredFoot: "right",
    });
  });

  it("reads the lazy-loaded portrait URL instead of the base64 placeholder", () => {
    const html = `<table class="items"><tbody><tr>
      <td class="zentriert">7</td>
      <td>
        <img src="data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=="
             data-src="https://img.a.transfermarkt.technology/portrait/medium/s_24404_190_2013_10_09_1.jpg?lm=4711"
             class="bilderrahmen-fixed lazy lazy" alt="" />
        <table class="inline-table"><tr><td><a href="/johan/profil/spieler/24404">Johan Wiland</a></td></tr>
        <tr><td>Goalkeeper</td></tr></table>
      </td>
    </tr></tbody></table>`;

    const { squadRows } = parseKaderHtml(html, "190", "FC Copenhagen", 2012);

    expect(squadRows[0]?.portraitSrc).toBe(
      "https://img.a.transfermarkt.technology/portrait/medium/s_24404_190_2013_10_09_1.jpg?lm=4711",
    );
  });

  it("parses Club facts and drops telephone", () => {
    const facts = parseClubFactsHtml(readFixture("facts/190.html"));
    expect(facts).toEqual({
      officialName: "F.C. Copenhagen",
      foundedOn: "1992-07-01",
      stadiumName: "Parken",
      stadiumCapacity: 38065,
      primaryColorHex: "#0053A0",
      secondaryColorHex: "#FFFFFF",
      websiteUrl: "https://www.fck.dk",
    });
  });

  it("parses Club honours season + title rows", () => {
    expect(parseHonoursHtml(readFixture("honours/190.html"))).toEqual([
      { seasonLabel: "10/11", title: "Danish champion" },
      { seasonLabel: "09/10", title: "Danish champion" },
    ]);
  });
});

describe("parseClubFactsHtml against the live Leicester City datenfakten page", () => {
  const facts = parseClubFactsHtml(readFixture("facts/1003-live.html"));

  it("reads the stadium from the data header, which is the only place TM renders it", () => {
    expect(facts.stadiumName).toBe("King Power Stadium");
    expect(facts.stadiumCapacity).toBe(32259);
  });

  it("still reads the facts that do sit in the profilheader table", () => {
    expect(facts.officialName).toBe("Leicester City Football Club");
    expect(facts.foundedOn).toBe("1884-01-01");
    expect(facts.websiteUrl).toBe("https://www.lcfc.com");
    expect(facts.primaryColorHex).toBe("#0053A0");
  });

  it("never stores the address rows or telephone as a fact", () => {
    expect(JSON.stringify(facts)).not.toContain("Filbert Way");
    expect(JSON.stringify(facts)).not.toContain("0844");
  });
});

describe("parseHonoursHtml against the live FC Copenhagen honours page", () => {
  const honours = parseHonoursHtml(readFixture("honours/190-live.html"));

  it("reads the All titles table even though it carries no items class", () => {
    expect(honours).toHaveLength(51);
  });

  it("splits the season label off the title", () => {
    expect(honours).toContainEqual(
      expect.objectContaining({ seasonLabel: "24/25", title: "Danish Champion" }),
    );
    expect(honours).toContainEqual(
      expect.objectContaining({ seasonLabel: "24/25", title: "Danish cup winner" }),
    );
    expect(honours.filter((row) => row.title === "Danish Champion").length).toBeGreaterThan(10);
  });

  it("keeps the trophy or competition mark URL from the titles table", () => {
    expect(honours).toContainEqual({
      seasonLabel: "24/25",
      title: "Danish Champion",
      imageSrc: "https://img.a.transfermarkt.technology/logo/tiny/dk1.png?lm=4711",
    });
    expect(honours).toContainEqual({
      seasonLabel: "25/26",
      title: "Champions League Participant",
      imageSrc: "https://img.a.transfermarkt.technology/erfolge/tiny/6.png?lm=4711",
    });
  });

  it("never emits a header row as an honour", () => {
    expect(honours.map((row) => row.title)).not.toContain("Title");
  });
});

describe("parseEnglishDate", () => {
  it("reads the day-first slashed dates the English Transfermarkt site emits", () => {
    expect(parseEnglishDate("24/01/1981 (32)")).toBe("1981-01-24");
    expect(parseEnglishDate("31/12/1994 (18)")).toBe("1994-12-31");
    expect(parseEnglishDate("01/08/1985 (27)")).toBe("1985-08-01");
  });

  it("still reads the named-month and dotted forms", () => {
    expect(parseEnglishDate("Aug 24, 1981 (31)")).toBe("1981-08-24");
    expect(parseEnglishDate("24.8.1981")).toBe("1981-08-24");
    expect(parseEnglishDate("1981-08-24")).toBe("1981-08-24");
  });

  it("rejects text that is not a date", () => {
    expect(parseEnglishDate("Goalkeeper")).toBeUndefined();
    expect(parseEnglishDate("40/01/1981")).toBeUndefined();
  });
});

describe("nationalityIsoFromName", () => {
  it("resolves the country names Transfermarkt puts in flag titles", () => {
    expect(nationalityIsoFromName("Denmark")).toBe("DK");
    expect(nationalityIsoFromName("Costa Rica")).toBe("CR");
    expect(nationalityIsoFromName("United States")).toBe("US");
    expect(nationalityIsoFromName("Cote d'Ivoire")).toBe("CI");
    expect(nationalityIsoFromName("Turkey")).toBe("TR");
    expect(nationalityIsoFromName("Serbia")).toBe("RS");
    expect(nationalityIsoFromName("Russia")).toBe("RU");
    expect(nationalityIsoFromName("England")).toBe("GB");
  });

  it("returns undefined for a player name", () => {
    expect(nationalityIsoFromName("Johan Sellberg-Wiland")).toBeUndefined();
  });
});

describe("kader HTML parser against the live-cached FC Copenhagen 2012/13 squad", () => {
  const parsed = parseKaderHtml(readFixture("kader/190-2012.html"), "190", "FC Copenhagen", 2012);

  it("fills date of birth and nationality on every row", () => {
    expect(parsed.squadRows).toHaveLength(32);
    expect(parsed.squadRows.filter((row) => row.dateOfBirth)).toHaveLength(32);
    expect(parsed.squadRows.filter((row) => row.nationalityIso)).toHaveLength(32);
  });

  it("reads the date-of-birth column without the trailing age", () => {
    expect(parsed.squadRows.find((row) => row.playerName === "Kim Christensen")).toMatchObject({
      playerId: "22851",
      dateOfBirth: "1979-07-16",
      nationalityIso: "DK",
      nationalityName: "Denmark",
    });
    expect(parsed.squadRows[0]).toMatchObject({
      playerName: "Johan Sellberg-Wiland",
      dateOfBirth: "1981-01-24",
      nationalityIso: "SE",
      nationalityName: "Sweden",
    });
  });

  it("never puts the player's own name in the nationality", () => {
    const names = parsed.squadRows.map((row) => row.playerName);
    for (const row of parsed.squadRows) {
      expect(names).not.toContain(row.nationalityName);
    }
  });

  it("keeps every citizenship and makes the first one primary", () => {
    expect(parsed.squadRows.find((row) => row.playerName === "Thomas Delaney")).toMatchObject({
      nationalityIso: "DK",
      nationalities: [
        { name: "Denmark", iso: "DK" },
        { name: "United States", iso: "US" },
      ],
    });
    expect(parsed.squadRows.find((row) => row.playerName === "Igor Vetokele")).toMatchObject({
      nationalityIso: "AO",
      nationalities: [
        { name: "Angola", iso: "AO" },
        { name: "Belgium", iso: "BE" },
      ],
    });
  });

  it("does not mistake the Joined column for the date of birth", () => {
    // Row 0 joined on 01/01/2009 and was born 24/01/1981.
    expect(parsed.squadRows[0]?.dateOfBirth).toBe("1981-01-24");
  });

  it("costs no extra profile fetches, with or without the body-fact opt-in", () => {
    const hops = parsed.squadRows.filter(squadRowNeedsProfile);
    expect(hops).toHaveLength(9);
    expect(hops.every((row) => row.shirtNumber === null)).toBe(true);
    // The squad table now fills date of birth and nationality for all 32 rows, so the
    // opt-in predicate escalates nothing here.
    expect(parsed.squadRows.filter(squadRowMissingBodyFacts)).toHaveLength(9);
  });
});

describe("player profile parser against live-cached profiles", () => {
  it("strips the shirt badge that Transfermarkt renders inside the headline", () => {
    const profile = parsePlayerProfileHtml(readFixture("profiles/player-221876.html"), "221876");
    expect(profile.playerName).toBe("Mikkel Wohlgemuth");
    expect(profile.shirtNumber).toBe(6);
  });

  it("harvests the profile info table", () => {
    const profile = parsePlayerProfileHtml(readFixture("profiles/player-221876.html"), "221876");
    expect(profile).toMatchObject({
      playerId: "221876",
      playerName: "Mikkel Wohlgemuth",
      dateOfBirth: "1995-06-04",
      heightCm: 179,
      preferredFoot: "right",
      position: "Defensive Midfield",
      nationalityIso: "DK",
      nationalityName: "Denmark",
      currentClubName: "Boldklubben af 1893",
    });
  });

  it("reads multiple citizenships and the full name", () => {
    const profile = parsePlayerProfileHtml(readFixture("profiles/player-103558.html"), "103558");
    expect(profile).toMatchObject({
      playerName: "Mos",
      fullName: "Mustafa Abdellaoue",
      dateOfBirth: "1988-08-01",
      placeOfBirth: "Oslo",
      heightCm: 181,
      preferredFoot: "right",
      position: "Centre-Forward",
      nationalityIso: "NO",
      nationalities: [
        { name: "Norway", iso: "NO" },
        { name: "Morocco", iso: "MA" },
      ],
    });
    expect(profile.nameInHomeCountry).toBe("مصطفى عبد اللاوي");
  });

  it("omits fields the profile page does not carry", () => {
    const profile = parsePlayerProfileHtml(readFixture("profiles/player-14963.html"), "14963");
    expect(profile).toMatchObject({
      playerName: "Martin Bergvold",
      dateOfBirth: "1984-02-20",
      placeOfBirth: "Rødovre",
      preferredFoot: "left",
    });
    expect(profile.fullName).toBeUndefined();
  });
});
