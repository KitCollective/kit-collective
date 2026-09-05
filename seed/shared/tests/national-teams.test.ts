import { describe, expect, it } from "vitest";
import { catalogNationalTeamIdentity, resolveNationalTeam } from "../src/national-teams.js";

describe("national team catalog", () => {
  it("resolves Denmark men aliases to TM id 3436", () => {
    for (const ref of ["3436", "denmark-men", "dk-men"]) {
      const def = resolveNationalTeam(ref);
      expect(def?.transfermarktId).toBe("3436");
      expect(def?.gender).toBe("men");
    }
  });

  it("catalogNationalTeamIdentity returns stable country metadata", () => {
    const identity = catalogNationalTeamIdentity("dk-men");
    expect(identity).toMatchObject({
      transfermarktId: "3436",
      iso3166: "DK",
      gender: "men",
      name: "Denmark",
    });
  });

  it("includes FKA team id for FKApi fetch join", () => {
    expect(resolveNationalTeam("3436")?.fkApiTeamId).toBe("denmark-kits");
  });
});
