import { describe, expect, it } from "vitest";
import {
  isOccasionNestedUnderTypeDefault,
  matchCompetitionLinks,
} from "../src/admin/kit-variant-nest.js";

describe("kit variant nesting", () => {
  it("nests a home occasion under league home, not as a peer", () => {
    const siblings = [
      { kitType: "home" },
      { kitType: "home", variant: "supercoppa-italiana" },
      { kitType: "home", variant: "european" },
      { kitType: "fourth" },
      { kitType: "gk", variant: "home" },
    ];
    expect(
      isOccasionNestedUnderTypeDefault(
        { kitType: "home", variant: "supercoppa-italiana" },
        siblings,
      ),
    ).toBe(true);
    expect(
      isOccasionNestedUnderTypeDefault({ kitType: "home", variant: "european" }, siblings),
    ).toBe(true);
    expect(isOccasionNestedUnderTypeDefault({ kitType: "home" }, siblings)).toBe(false);
    expect(isOccasionNestedUnderTypeDefault({ kitType: "fourth" }, siblings)).toBe(false);
    expect(isOccasionNestedUnderTypeDefault({ kitType: "gk", variant: "home" }, siblings)).toBe(
      false,
    );
  });

  it("keeps occasion-only specials and third-cup kits according to type-default presence", () => {
    const barcelona = [
      { kitType: "home" },
      { kitType: "home", variant: "clasico" },
      { kitType: "third" },
      { kitType: "third", variant: "supercopa-de-espana" },
      { kitType: "special", variant: "copa-del-rey-final" },
      { kitType: "gk", variant: "clasico" },
    ];
    expect(
      isOccasionNestedUnderTypeDefault({ kitType: "home", variant: "clasico" }, barcelona),
    ).toBe(true);
    expect(
      isOccasionNestedUnderTypeDefault(
        { kitType: "third", variant: "supercopa-de-espana" },
        barcelona,
      ),
    ).toBe(true);
    expect(
      isOccasionNestedUnderTypeDefault(
        { kitType: "special", variant: "copa-del-rey-final" },
        barcelona,
      ),
    ).toBe(false);
    expect(isOccasionNestedUnderTypeDefault({ kitType: "gk", variant: "clasico" }, barcelona)).toBe(
      false,
    );
  });

  it("links competition tokens that match a league CatalogLabel and leaves the rest plain", () => {
    expect(
      matchCompetitionLinks(
        "Serie A · EA SPORTS FC Supercup",
        ["supercoppa-italiana"],
        [
          { id: "11111111-1111-4111-8111-111111111111", text: "Serie A" },
          { id: "22222222-2222-4222-8222-222222222222", text: "Superliga" },
        ],
      ),
    ).toEqual([
      {
        label: "Serie A",
        href: "/stamdata/leagues/11111111-1111-4111-8111-111111111111",
      },
      { label: "EA SPORTS FC Supercup" },
    ]);
  });

  it("adds a variant slug link only when that slug already exists as a league label", () => {
    expect(
      matchCompetitionLinks(
        "EA SPORTS FC Supercup",
        ["supercoppa-italiana"],
        [{ id: "33333333-3333-4333-8333-333333333333", text: "Supercoppa Italiana" }],
      ),
    ).toEqual([
      { label: "EA SPORTS FC Supercup" },
      {
        label: "Supercoppa Italiana",
        href: "/stamdata/leagues/33333333-3333-4333-8333-333333333333",
      },
    ]);
  });
});
