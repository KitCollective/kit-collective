import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  closeConfirmSheet,
  openConfirmSheet,
  shouldOpenSeasonAfterClubDismiss,
} from "../src/capture/confirmSheet";

const confirmPath = join(__dirname, "../app/(capture)/confirm.tsx");

describe("confirmSheet", () => {
  it("allows only one picker sheet kind at a time", () => {
    expect(openConfirmSheet("club", "season")).toBe("season");
    expect(closeConfirmSheet("season", "season")).toBeNull();
    expect(closeConfirmSheet("club", "season")).toBe("club");
  });

  it("opens season only after the club sheet dismisses", () => {
    expect(shouldOpenSeasonAfterClubDismiss(true, "club")).toBe(true);
    expect(shouldOpenSeasonAfterClubDismiss(true, "season")).toBe(false);
    expect(shouldOpenSeasonAfterClubDismiss(false, "club")).toBe(false);
  });
});

describe("Confirm chrome", () => {
  it("groups identity and condition fields in two surface cards on one scroll", () => {
    const confirm = readFileSync(confirmPath, "utf8");

    expect(confirm).toContain("Identitet");
    expect(confirm).toContain("Tilstand");
    expect(confirm).toContain("ProfileSurfaceGroup");
    expect(confirm).toContain("<ScrollView");
    expect(confirm).not.toMatch(/Stamdata\s*\|/);
    expect(confirm).not.toMatch(/stepper|TabView/i);
    expect(confirm).toContain("canSave(draft)");
  });

  it("does not stack season picker on top of a still-open club sheet", () => {
    const confirm = readFileSync(confirmPath, "utf8");

    expect(confirm).toContain("useState<ConfirmSheetKind | null>");
    expect(confirm).toContain('visible={openSheet === "club"}');
    expect(confirm).toContain('visible={openSheet === "season"}');
    expect(confirm).toContain("pendingSeasonAfterClub");
    expect(confirm).not.toMatch(/setSeasonSheetOpen\(true\)/);
    expect(confirm).not.toMatch(/setClubSheetOpen\(false\)[\s\S]{0,80}setSeasonSheetOpen\(true\)/);
  });

  it("keeps player print off the main confirm column", () => {
    const confirm = readFileSync(confirmPath, "utf8");
    const mainColumn = confirm.slice(
      confirm.indexOf("<ScrollView"),
      confirm.indexOf("</ScrollView>"),
    );

    expect(mainColumn).not.toMatch(/Spiller-print|nameset|playerPrint/i);
    expect(confirm).toContain('title="Flere detaljer"');
  });
});
