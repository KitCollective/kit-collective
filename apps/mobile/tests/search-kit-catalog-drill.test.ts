import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSearchTypeahead } from "../src/search/search-view-model";

const kitRoutePath = join(__dirname, "../app/(tabs)/search/kit/[kitId].tsx");
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

describe("Søg Kit catalog drill (KIT-157)", () => {
  it("replaces the kit stub with CatalogDrillScreen kind kit", () => {
    const source = readFileSync(kitRoutePath, "utf8");
    const clubSource = readFileSync(clubRoutePath, "utf8");

    expect(source).not.toMatch(/ikke klar endnu/);
    expect(source).not.toMatch(/SearchKitDrillStubScreen/);
    expect(source).toMatch(/export default function SearchKitDrillScreen\(/);
    expect(source).toMatch(/kind="kit"/);
    expect(tabBarPaddingDecl(source, "kit/[kitId].tsx")).toBe(
      tabBarPaddingDecl(clubSource, "club/[clubId].tsx"),
    );
  });

  it("opens typeahead Kit hits on the kit catalog drill", () => {
    const kitId = "99999999-9999-4999-8999-999999999999";
    const { hits } = buildSearchTypeahead({
      kits: [{ kitId, label: "OB 2023/24 Hjemme", jerseyCount: 1, photo: null }],
    });
    const source = readFileSync(searchIndexPath, "utf8");

    expect(hits[0]?.href).toBe(`/(tabs)/search/kit/${kitId}?label=OB%202023%2F24%20Hjemme`);
    expect(source).not.toMatch(/openKitStub/);
    expect(source).toMatch(/onPress=\{\(\) => router\.push\(hit\.href\)\}/);
  });

  it("fetches kit drills from the kits collection path", () => {
    const source = readFileSync(biddingPath, "utf8");

    expect(source).toMatch(/kit: "kits"/);
    expect(source).toContain("`/v1/collection/discover/${segment}/${entityId}`");
  });

  it("uses kitId and a club Mark when kind is kit", () => {
    const source = readFileSync(catalogDrillPath, "utf8");

    expect(source).toMatch(/kitId\?: string/);
    expect(source).toMatch(/params\.kitId/);
    expect(source).toContain(
      'const markLabel = kind === "kit" ? (drill?.jerseys[0]?.clubLabel ?? title) : title;',
    );
    expect(source).toMatch(/testID=\{`catalog-drill-\$\{kind\}`\}/);
  });
});
