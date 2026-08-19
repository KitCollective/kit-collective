import { describe, expect, it } from "vitest";
import { resolveSeasonRef } from "../src/season-ref.js";
import { parseSeedScopeArgv } from "../src/seed-scope.js";

describe("resolveSeasonRef", () => {
  it("maps 0001 to Superliga first Transfermarkt season", () => {
    expect(resolveSeasonRef("superligaen", "0001")).toBe("1991/92");
  });

  it("passes labels through unchanged", () => {
    expect(resolveSeasonRef("superligaen", "1995/96")).toBe("1995/96");
  });
});

describe("parseSeedScopeArgv", () => {
  it("parses competition range with default lane", () => {
    const result = parseSeedScopeArgv(["dk1", "1995/96", "2025/26"]);
    expect(result).toEqual({
      ok: true,
      parsed: {
        scope: {
          kind: "competition",
          competition: "dk1",
          fromSeason: "1995/96",
          toSeason: "2025/26",
        },
        lane: "development",
      },
    });
  });

  it("parses club scope", () => {
    const result = parseSeedScopeArgv(["club", "dk1", "club-190", "23/24", "staging"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.parsed.scope).toEqual({
        kind: "club",
        competition: "dk1",
        clubExternalId: "club-190",
        season: "23/24",
      });
      expect(result.parsed.lane).toBe("staging");
    }
  });

  it("rejects production lane", () => {
    const result = parseSeedScopeArgv(["dk1", "0001", "today", "production"]);
    expect(result.ok).toBe(false);
  });
});
