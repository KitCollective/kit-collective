import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("Admin kit drill", () => {
  it("renders a two-column identity + gallery with FKA fact rows", () => {
    const page = readFileSync(join(here, "KitDrillPage.tsx"), "utf8");

    expect(page).toContain("kit-drill");
    expect(page).toContain("kit-drill-facts");
    expect(page).toContain("kit-drill-identity");
    expect(page).toContain("kit-drill-photos");
    expect(page).toContain("kit-photo-hero");
    expect(page).toContain("kit-photo-thumbs");
    expect(page).toContain("KitDrillSkeleton");
    expect(page).toContain("kit-skel");
    expect(page).toContain("aria-busy");
    expect(page).toContain("loadAuthenticatedBlob");
    expect(page).toContain("kit-drill--ready");
    expect(page).toContain("CatalogMark");
    expect(page).toContain("kit?.clubId");
    expect(page).toContain("/stamdata/clubs/");
    expect(page).toContain("kit-club-link");
    expect(page).toContain("kit.kitType}");
    expect(page).toContain("kit.variant");
    expect(page).toContain("kit.variants");
    expect(page).toContain("Variants");
    expect(page).toContain("parentKit");
    expect(page).toContain("competitionHref");
    expect(page).toContain("CompetitionLinks");
    expect(page).toContain("kit.competitions");
    expect(page).toContain("kit.seasonLabel");
    expect(page).toContain("kit-color-swatch");
    expect(page).toContain("kit?.photos");
    expect(page).toContain("Team");
    expect(page).toContain("Design");
    expect(page).toContain("Colors");
    expect(page).toContain("Brand");
    expect(page).toContain("Sponsor");
    expect(page).toContain("Competition");
    expect(page).toContain("Release date");
    expect(page).toContain("Variant");
    expect(page).toContain("kit.description");
    expect(page).not.toContain("Rating");
    expect(page).not.toContain("kit-photo-strip");
  });
});
