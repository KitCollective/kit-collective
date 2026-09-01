import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const kitRoutePath = join(__dirname, "../app/(tabs)/search/kit/[kitId].tsx");
const clubRoutePath = join(__dirname, "../app/(tabs)/search/club/[clubId].tsx");
const searchIndexPath = join(__dirname, "../app/(tabs)/search/index.tsx");
const catalogDrillPath = join(__dirname, "../src/components/catalog-drill-screen.tsx");
const biddingPath = join(__dirname, "../src/api/bidding.ts");

describe("Søg Kit catalog drill (KIT-157)", () => {
  it("replaces the kit stub with CatalogDrillScreen kind kit", () => {
    const source = readFileSync(kitRoutePath, "utf8");
    const clubSource = readFileSync(clubRoutePath, "utf8");

    expect(source).not.toMatch(/ikke klar endnu/);
    expect(source).not.toMatch(/SearchKitDrillStubScreen/);
    expect(source).toMatch(/export default function SearchKitDrillScreen\(/);
    expect(source).toMatch(/kind="kit"/);
    expect(source).toMatch(/tabBarPadding/);
    expect(source).toContain(clubSource.match(/const tabBarPadding =[\s\S]*?;/)?.[0] ?? "");
  });

  it("opens typeahead Kit hits on the kit catalog drill", () => {
    const source = readFileSync(searchIndexPath, "utf8");

    expect(source).toMatch(/const openKitDrill = /);
    expect(source).not.toMatch(/openKitStub/);
    expect(source).toMatch(/\/\(tabs\)\/search\/kit\//);
    expect(source).toMatch(/onPress=\{\(\) => openKitDrill\(kitHit\.kitId, kitHit\.label\)\}/);
  });

  it("fetches kit drills from the kits collection path", () => {
    const source = readFileSync(biddingPath, "utf8");

    expect(source).toMatch(/CollectionDiscoverCatalogDrill\["kind"\]/);
    expect(source).toMatch(/kits/);
  });

  it("uses kitId and a club Mark when kind is kit", () => {
    const source = readFileSync(catalogDrillPath, "utf8");

    expect(source).toMatch(/kitId\?: string/);
    expect(source).toMatch(/params\.kitId/);
    expect(source).toMatch(/kind === "kit"/);
    expect(source).toMatch(/clubLabel/);
    expect(source).toMatch(/testID=\{`catalog-drill-\$\{kind\}`\}/);
  });
});
