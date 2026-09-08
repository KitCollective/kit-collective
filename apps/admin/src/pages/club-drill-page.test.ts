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
    expect(page).toContain("tab === \"honours\" ? null");
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
});
