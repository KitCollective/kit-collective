import { describe, expect, it } from "vitest";
import { checkMobileWishlistUiEvidence } from "../src/testing/wishlist-ui-evidence";

const logicFixture = `
  export function resolveWishlistEmptyBody() { return "Tilføj en ønskerække med klub, sæson eller type."; }
  export function resolveWishlistEmptyTitle() {}
  export function resolveWishlistSheetTitle() {}
  export function canSaveWishlistEntry() {}
  export function hasWishlistCriterion() {}
  export function buildWishlistWritePayload() {}
  export function seedCriteriaForEdit() {}
  export function manageRowAccessibilityLabel() {}
`;

const testFixture = `
  import { resolveWishlistEmptyBody, resolveWishlistSheetTitle, canSaveWishlistEntry,
    hasWishlistCriterion, manageRowAccessibilityLabel } from "../src/components/wishlist-sheet-logic";
  Ønske Ny ønskerække resolveWishlistEmptyBody
`;

describe("checkMobileWishlistUiEvidence", () => {
  it("passes on the shipped wishlist sheet, logic, tests, and service", () => {
    const violations = checkMobileWishlistUiEvidence();
    expect(violations).toEqual([]);
  });

  it("fails when EmptyState body is empty", () => {
    const violations = checkMobileWishlistUiEvidence({
      sheetSource:
        'body="" SeasonPickerOverlay FacetPickerOverlay borderSubtle wishlist-sheet-logic',
      logicExists: true,
      testExists: true,
      logicSource: logicFixture,
      testSource: testFixture,
    });

    expect(violations.some((v) => v.includes("resolveWishlistEmptyBody"))).toBe(true);
  });

  it("fails when writeToValues mints dummy identity fields", () => {
    const violations = checkMobileWishlistUiEvidence({
      sheetSource:
        "resolveWishlistEmptyBody() SeasonPickerOverlay FacetPickerOverlay borderSubtle wishlist-sheet-logic",
      logicExists: true,
      testExists: true,
      logicSource: logicFixture,
      testSource: testFixture,
      serviceSource: `
        private writeToValues(body: WishlistEntryWrite): WishlistRow {
          return { id: "", userId: "", clubId: null, seasonId: null, type: null, size: null };
        }
      `,
    });

    expect(violations.some((v) => v.includes("dummy id/userId"))).toBe(true);
  });
});
