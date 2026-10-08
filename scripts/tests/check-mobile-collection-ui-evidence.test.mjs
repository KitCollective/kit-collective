import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkMobileCollectionUiEvidence } from "../check-mobile-collection-ui-evidence.mjs";

describe("checkMobileCollectionUiEvidence", () => {
  it("passes when genveje sheet, logic, and tests are wired", () => {
    const sheetSource = `
      import { resolveGenvejeSheetTitle } from "@/components/genveje-sheet-logic";
      accessibilityLabel="Flyt"
    `;
    const logicSource = `
      export function resolveGenvejeSheetTitle() {}
      export function canSaveGenvej() {}
      export function seedClubForEdit() {}
      export function manageRowAccessibilityLabel() {}
      export function shouldResetShortcutAfterDelete() {}
      export function shouldResetToAlleAfterGem() {}
      export function shouldFallbackToAlleOnFetchError() {}
    `;
    const testSource = `
      import { resolveGenvejeSheetTitle, canSaveGenvej, seedClubForEdit,
        manageRowAccessibilityLabel, shouldResetShortcutAfterDelete,
        shouldResetToAlleAfterGem, shouldFallbackToAlleOnFetchError } from "../src/components/genveje-sheet-logic";
      Genveje Ny genvej Flyt
    `;

    const violations = checkMobileCollectionUiEvidence({
      sheetSource,
      logicExists: true,
      testExists: true,
      logicSource,
      testSource,
    });

    assert.equal(violations.length, 0);
  });

  it("fails when the Flyt drag-handle name is missing", () => {
    const violations = checkMobileCollectionUiEvidence({
      sheetSource: 'import { resolveGenvejeSheetTitle } from "@/components/genveje-sheet-logic";',
      logicExists: true,
      testExists: true,
      logicSource: "export function resolveGenvejeSheetTitle() {}",
      testSource:
        "genveje-sheet-logic Genveje Ny genvej Flyt resolveGenvejeSheetTitle canSaveGenvej seedClubForEdit manageRowAccessibilityLabel shouldResetShortcutAfterDelete shouldResetToAlleAfterGem shouldFallbackToAlleOnFetchError",
    });

    assert.ok(violations.some((v) => v.includes("Flyt")));
  });
});
