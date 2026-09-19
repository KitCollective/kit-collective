import { describe, expect, it } from "vitest";
import {
  discoverJerseySideFields,
  discoverJerseySideFromLabels,
  uniqueNonNullIds,
} from "../src/collection/catalog-side.js";

describe("uniqueNonNullIds", () => {
  it("drops nulls and duplicates while keeping order of first occurrence", () => {
    expect(uniqueNonNullIds([null, "a", "b", "a", undefined, "c"])).toEqual(["a", "b", "c"]);
  });
});

describe("discoverJerseySideFromLabels", () => {
  it("maps a club row through the label maps", () => {
    expect(
      discoverJerseySideFromLabels(
        { clubId: "club-1", nationalTeamId: null },
        new Map([["club-1", "F.C. København"]]),
        new Map(),
      ),
    ).toEqual({ clubId: "club-1", clubLabel: "F.C. København" });
  });

  it("maps a national-team row into the display clubLabel slot", () => {
    expect(
      discoverJerseySideFromLabels(
        { clubId: null, nationalTeamId: "nt-1" },
        new Map(),
        new Map([["nt-1", "Danmark"]]),
      ),
    ).toEqual({ nationalTeamId: "nt-1", clubLabel: "Danmark" });
  });

  it("returns null when the side label is missing", () => {
    expect(
      discoverJerseySideFromLabels({ clubId: null, nationalTeamId: "nt-1" }, new Map(), new Map()),
    ).toBeNull();
    expect(discoverJerseySideFields({ clubId: null, nationalTeamId: null })).toBeNull();
  });
});
