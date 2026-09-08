import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("Admin Master Data chrome", () => {
  it("uses Clubs, Leagues, and Players underline tabs with pagination and searchable filters", () => {
    const page = readFileSync(join(here, "MasterDataPage.tsx"), "utf8");
    const filters = readFileSync(join(here, "../components/FiltersSheet.tsx"), "utf8");
    const app = readFileSync(join(here, "../App.tsx"), "utf8");

    expect(page).toContain("MasterDataPage");
    expect(page).toContain("Clubs");
    expect(page).toContain("Leagues");
    expect(page).toContain("Players");
    expect(page).toContain("toolbar-tabs");
    expect(page).toContain("icon-btn--toolbar");
    expect(page).toContain("FilterIcon");
    expect(page).toContain("CatalogMark");
    expect(page).toContain("row.markPath");

    const mark = readFileSync(join(here, "../components/CatalogMark.tsx"), "utf8");
    expect(mark).toContain("monogram-slot");
    expect(mark).toContain("monogram-slot--lg");
    expect(mark).not.toMatch(/<AuthenticatedImage[^>]*className="monogram-slot"/);
    expect(page).toContain("record-count");
    expect(page).toContain("table-pagination-actions");
    expect(page).toContain("Previous");
    expect(page).toContain("Next");
    expect(page).not.toContain("Club seasons");
    expect(page).not.toContain('"Seasons"');
    expect(page).not.toContain("Kits");
    expect(page).not.toContain("Loading stamdata");

    expect(filters).toContain("Search countries");
    expect(filters).toContain("Search leagues");
    expect(filters).toContain("sheet-panel--end");
    expect(filters).toContain("filter-combobox-trigger");
    expect(filters).toContain("aria-multiselectable");
    expect(filters).toContain("Any country");
    expect(filters).toContain("Any league");
    expect(filters).toContain("sheet-panel-header");
    expect(filters).toContain("sheet-panel-footer-actions");
    expect(filters).not.toContain("Has photo");
    expect(filters).not.toContain("Kit type");

    expect(app).toContain("MasterDataPage");
    expect(app).toContain("/stamdata/leagues/:leagueId");
    expect(app).toContain("/stamdata/players/:playerId");
  });
});
