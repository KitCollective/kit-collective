import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const nationalTeamRoutePath = join(
  __dirname,
  "../app/(tabs)/search/national-team/[nationalTeamId].tsx",
);
const clubRoutePath = join(__dirname, "../app/(tabs)/search/club/[clubId].tsx");
const searchIndexPath = join(__dirname, "../app/(tabs)/search/index.tsx");
const catalogDrillPath = join(__dirname, "../src/components/catalog-drill-screen.tsx");
const biddingPath = join(__dirname, "../src/api/bidding.ts");

const TAB_BAR_PADDING_DECL = /const tabBarPadding =[\s\S]*?;/;

function tabBarPaddingDecl(source: string, file: string): string {
  const match = source.match(TAB_BAR_PADDING_DECL)?.[0];
  expect(match, `${file} must declare tabBarPadding`).toBeTruthy();
  return match ?? "";
}

describe("Søg NationalTeam catalog drill", () => {
  it("ships CatalogDrillScreen kind national_team as a sibling of Club", () => {
    const source = readFileSync(nationalTeamRoutePath, "utf8");
    const clubSource = readFileSync(clubRoutePath, "utf8");

    expect(source).toMatch(/export default function SearchNationalTeamDrillScreen\(/);
    expect(source).toMatch(/kind="national_team"/);
    expect(tabBarPaddingDecl(source, "national-team/[nationalTeamId].tsx")).toBe(
      tabBarPaddingDecl(clubSource, "club/[clubId].tsx"),
    );
  });

  it("opens typeahead Landshold hits on the national-team catalog drill", () => {
    const source = readFileSync(searchIndexPath, "utf8");

    expect(source).toMatch(/const openNationalTeamDrill = /);
    expect(source).toMatch(/\/\(tabs\)\/search\/national-team\//);
    expect(source).toMatch(/testID="typeahead-national-teams"/);
  });

  it("fetches national-team drills from the national-teams collection path", () => {
    const source = readFileSync(biddingPath, "utf8");

    expect(source).toMatch(/national_team: "national-teams"/);
    expect(source).toContain("`/v1/collection/discover/${segment}/${entityId}`");
  });

  it("uses nationalTeamId when kind is national_team", () => {
    const source = readFileSync(catalogDrillPath, "utf8");

    expect(source).toMatch(/nationalTeamId\?: string/);
    expect(source).toMatch(/params\.nationalTeamId/);
    expect(source).toMatch(/kind === "national_team"/);
  });
});
