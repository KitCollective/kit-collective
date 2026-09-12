import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("Admin club drill honours", () => {
  it("lists Honours with catalog marks and hides the season picker on that tab", () => {
    const page = readFileSync(join(here, "ClubDrillPage.tsx"), "utf8");

    expect(page).toContain('"honours"');
    expect(page).toContain("Honours");
    expect(page).toContain("club-tab-honours");
    expect(page).toContain("No honours");
    expect(page).toContain("row.markPath");
    expect(page).toContain('tab === "honours" ? null');
    expect(page).not.toContain("tmLogoUrl");
  });

  it("puts a large crest on the left of Current league and Club facts, and groups the squad", () => {
    const page = readFileSync(join(here, "ClubDrillPage.tsx"), "utf8");

    expect(page).toContain("identity-facts");
    expect(page).toContain("stats-row-span");
    expect(page).toContain('size="lg"');
    expect(page).toContain("Current league");
    expect(page).toContain("Founded");
    expect(page).toContain("Stadium");
    expect(page).toContain("groupSquadPlayers");
    expect(page).toContain("Position");
    expect(page.indexOf("identity-mark")).toBeLessThan(page.indexOf("Current league"));

    const squad = readFileSync(join(here, "club-drill-squad.ts"), "utf8");
    expect(squad).toContain("Goalkeepers");
    expect(squad).toContain("Defenders");
    expect(squad).toContain("Midfielders");
    expect(squad).toContain("Attackers");
  });

  it("keeps Fetch kits beside Season, and the empty primary only on No jerseys", () => {
    const page = readFileSync(join(here, "ClubDrillPage.tsx"), "utf8");

    expect(page).toContain("Fetch kits");
    expect(page).toContain("/kits/fetch");
    expect(page).toContain("banner-success");
    expect(page).toContain("icon-btn--toolbar");
    expect(page).toContain("icon-btn--sync");
    expect(page).toContain("icon-btn--busy");
    expect(page).toContain("Fetching kits");
    expect(page).toContain("chip-group toolbar-chips drill-tabs");
    expect(page).toContain('className="chip"');
    expect(page).not.toContain("top-tab");
    expect(page).not.toContain("{tab === \"jerseys\" ? (");
    expect(page).not.toContain('className="btn btn-secondary"');
    expect(page).toContain('className="btn btn-primary btn-primary--auto"');
    expect(page).toContain("ClubTableSkeleton");
    expect(page).toContain("kit-skel");
    expect(page).toContain("peekClubSeasonDrill");
    expect(page).toContain("loadAuthenticatedBlob");
    expect(page).toContain("jersey.variantCount");
    expect(page).toContain("jersey.variant");
    expect(page).not.toContain("Loading…");
    expect(page).not.toContain("+ New");

    const honoursEmpty = page.indexOf("No honours");
    const playersEmpty = page.indexOf("No players");
    const jerseysEmpty = page.indexOf("No jerseys");
    expect(honoursEmpty).toBeGreaterThan(-1);
    expect(playersEmpty).toBeGreaterThan(-1);
    expect(jerseysEmpty).toBeGreaterThan(-1);
    expect(page.slice(honoursEmpty, honoursEmpty + 280)).not.toContain("Fetch kits");
    expect(page.slice(playersEmpty, jerseysEmpty)).not.toContain("Fetch kits");
    expect(page.slice(jerseysEmpty, jerseysEmpty + 900)).toContain("Fetch kits");
  });
});
