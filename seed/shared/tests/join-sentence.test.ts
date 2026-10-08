import { describe, expect, it } from "vitest";
import { parseJoinSentence } from "../src/join-sentence.js";

describe("parseJoinSentence", () => {
  it("parses Superliga 2010/11 club sentence into development lane", () => {
    const result = parseJoinSentence(
      "Seed Superliga 2010/11 including every club, squads, and kits into development.",
    );
    expect(result).toEqual({
      ok: true,
      scope: {
        path: "club",
        competition: "superliga",
        season: "2010/11",
        lane: "development",
      },
    });
  });

  it("parses Denmark men World Cup 2010 national team sentence", () => {
    const result = parseJoinSentence(
      "Seed Denmark men World Cup 2010 including squad and kits into development.",
    );
    expect(result).toEqual({
      ok: true,
      scope: {
        path: "national_team",
        nationalTeamRef: "3436",
        season: "2010",
        lane: "development",
      },
    });
  });

  it("honours staging when named in the sentence", () => {
    const result = parseJoinSentence(
      "Seed Superliga 2010/11 including every club, squads, and kits into staging.",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scope.lane).toBe("staging");
    }
  });

  it("rejects production lane", () => {
    const result = parseJoinSentence(
      "Seed Superliga 2010/11 including every club, squads, and kits into production.",
    );
    expect(result).toEqual({
      ok: false,
      error: "Production lane is rejected for Seed runs",
    });
  });

  it("rejects ambiguous empty sentence", () => {
    const result = parseJoinSentence("   ");
    expect(result.ok).toBe(false);
  });
});
