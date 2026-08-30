import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkMobileWishlistUiEvidence } from "../check-mobile-wishlist-ui-evidence.mjs";

const logicSource = `
  export function resolveWishlistEmptyBody() { return "Tilføj en ønskerække med klub, sæson eller type."; }
  export function resolveWishlistEmptyTitle() {}
  export function resolveWishlistSheetTitle() {}
  export function canSaveWishlistEntry() {}
  export function hasWishlistCriterion() {}
  export function buildWishlistWritePayload() {}
  export function seedCriteriaForEdit() {}
  export function manageRowAccessibilityLabel() {}
`;

const testSource = `
  import { resolveWishlistEmptyBody, resolveWishlistSheetTitle, canSaveWishlistEntry,
    hasWishlistCriterion, manageRowAccessibilityLabel } from "../src/components/wishlist-sheet-logic";
  Ønske Ny ønskerække resolveWishlistEmptyBody
`;

describe("checkMobileWishlistUiEvidence", () => {
  it("passes when wishlist sheet, logic, tests, and service are wired", () => {
    const sheetSource = `
      import { resolveWishlistEmptyBody } from "./wishlist-sheet-logic";
      body={resolveWishlistEmptyBody()}
      SeasonPickerOverlay
      FacetPickerOverlay
      borderSubtle
    `;
    const serviceSource = `
      type WishlistCriteriaValues = Pick<WishlistRow, "clubId" | "seasonId" | "type" | "size">;
      private writeToValues(body: WishlistEntryWrite): WishlistCriteriaValues {
        return { clubId: null, seasonId: null, type: null, size: null };
      }
    `;

    const violations = checkMobileWishlistUiEvidence({
      sheetSource,
      logicExists: true,
      testExists: true,
      logicSource,
      testSource,
      serviceSource,
      domainSource: "export function hasWishlistCriterion() {}",
    });

    assert.equal(violations.length, 0);
  });

  it("fails when EmptyState body is empty", () => {
    const violations = checkMobileWishlistUiEvidence({
      sheetSource:
        'body="" SeasonPickerOverlay FacetPickerOverlay borderSubtle wishlist-sheet-logic',
      logicExists: true,
      testExists: true,
      logicSource,
      testSource,
    });

    assert.ok(violations.some((v) => v.includes("resolveWishlistEmptyBody")));
  });

  it("fails when writeToValues mints dummy identity fields", () => {
    const violations = checkMobileWishlistUiEvidence({
      sheetSource:
        "resolveWishlistEmptyBody() SeasonPickerOverlay FacetPickerOverlay borderSubtle wishlist-sheet-logic",
      logicExists: true,
      testExists: true,
      logicSource,
      testSource,
      serviceSource: `
        private writeToValues(body: WishlistEntryWrite): WishlistRow {
          return { id: "", userId: "", clubId: null, seasonId: null, type: null, size: null };
        }
      `,
    });

    assert.ok(violations.some((v) => v.includes("dummy id/userId")));
  });
});
