import { describe, expect, it } from "vitest";
import { catalogSideId } from "../src/catalog/side.js";

describe("catalogSideId", () => {
  it("prefers clubId when both are present", () => {
    expect(catalogSideId({ clubId: "club-1", nationalTeamId: "nt-1" })).toBe("club-1");
  });

  it("returns the national-team id when clubId is absent", () => {
    expect(catalogSideId({ clubId: null, nationalTeamId: "nt-1" })).toBe("nt-1");
  });

  it("returns null when neither side is set", () => {
    expect(catalogSideId({ clubId: null, nationalTeamId: null })).toBeNull();
  });
});
