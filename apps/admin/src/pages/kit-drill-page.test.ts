import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("Admin kit drill", () => {
  it("renders a two-column identity + gallery with FKA fact rows", () => {
    const page = readFileSync(join(here, "KitDrillPage.tsx"), "utf8");

    expect(page).toContain("kit-drill");
    expect(page).toContain("kit-photo-hero");
    expect(page).toContain("prefetchAuthenticatedBlobs");
    expect(page).toContain("kit.variants");
    expect(page).toContain("Variants");
    expect(page).toContain("CompetitionLinks");
    expect(page).toContain("kit.competitions");
    expect(page).toContain("kit-color-swatch");
    expect(page).toContain("Release date");
    expect(page).not.toContain("Rating");
    expect(page).not.toContain("kit-photo-strip");
  });
});
