#!/usr/bin/env node
/**
 * Ratchet (KIT-133): fail CI when Wishlist Sheet UI ships without locked mechanical
 * evidence (empty-state body, season overlay + ListRow, manage-row hairlines, API slop).
 */
import { existsSync, readFileSync } from "node:fs";

const wishlistSheetPath = "apps/mobile/src/components/wishlist-sheet.tsx";
const wishlistLogicPath = "apps/mobile/src/components/wishlist-sheet-logic.ts";
const wishlistTestPath = "apps/mobile/tests/wishlist-sheet.test.ts";
const wishlistServicePath = "apps/api/src/wishlist/wishlist.service.ts";
const domainWishlistPath = "packages/domain/src/wishlist.ts";

const REQUIRED_LOGIC_EXPORTS = [
  "resolveWishlistEmptyBody",
  "resolveWishlistEmptyTitle",
  "resolveWishlistSheetTitle",
  "canSaveWishlistEntry",
  "hasWishlistCriterion",
  "buildWishlistWritePayload",
  "seedCriteriaForEdit",
  "manageRowAccessibilityLabel",
];

const REQUIRED_TEST_MARKERS = [
  "resolveWishlistEmptyBody",
  "resolveWishlistSheetTitle",
  "canSaveWishlistEntry",
  "hasWishlistCriterion",
  "manageRowAccessibilityLabel",
  "Ønske",
  "Ny ønskerække",
];

export function checkMobileWishlistUiEvidence(overrides = {}) {
  const violations = [];

  if (!existsSync(wishlistSheetPath)) {
    return violations;
  }

  const sheetSource = overrides.sheetSource ?? readFileSync(wishlistSheetPath, "utf8");
  const logicExists = overrides.logicExists ?? existsSync(wishlistLogicPath);
  const testExists = overrides.testExists ?? existsSync(wishlistTestPath);

  if (!logicExists) {
    violations.push(`${wishlistLogicPath}: required pure logic module for wishlist UI evidence`);
  }

  if (!testExists) {
    violations.push(`${wishlistTestPath}: required vitest evidence for wishlist UI ACs`);
  }

  if (!sheetSource.includes("wishlist-sheet-logic")) {
    violations.push(`${wishlistSheetPath}: must import shared logic from wishlist-sheet-logic`);
  }

  if (sheetSource.includes('body=""') || sheetSource.includes("body={''}")) {
    violations.push(
      `${wishlistSheetPath}: EmptyState body must use resolveWishlistEmptyBody(), not an empty string`,
    );
  }

  if (!sheetSource.includes("resolveWishlistEmptyBody()")) {
    violations.push(`${wishlistSheetPath}: EmptyState must call resolveWishlistEmptyBody()`);
  }

  if (!sheetSource.includes("SeasonPickerOverlay")) {
    violations.push(
      `${wishlistSheetPath}: season pick must use SeasonPickerOverlay (facet overlay + ListRow), not a nested Sheet`,
    );
  }

  if (sheetSource.match(/<Sheet[\s\S]*season/i) && sheetSource.includes("seasonPickerOpen")) {
    const nestedSeasonSheet = /<Sheet[^>]*visible=\{[^}]*seasonPickerOpen/.test(sheetSource);
    if (nestedSeasonSheet) {
      violations.push(
        `${wishlistSheetPath}: season pick must not be a nested Sheet — use SeasonPickerOverlay`,
      );
    }
  }

  if (!sheetSource.includes("borderSubtle")) {
    violations.push(
      `${wishlistSheetPath}: grouped manage rows must use borderSubtle hairlines between rows`,
    );
  }

  if (!sheetSource.includes("FacetPickerOverlay")) {
    violations.push(`${wishlistSheetPath}: club pick must use FacetPickerOverlay`);
  }

  if (logicExists) {
    const logicSource = overrides.logicSource ?? readFileSync(wishlistLogicPath, "utf8");
    for (const exportName of REQUIRED_LOGIC_EXPORTS) {
      if (!logicSource.includes(`export function ${exportName}`)) {
        violations.push(`${wishlistLogicPath}: missing export ${exportName}`);
      }
    }

    const bodyMatch = logicSource.match(
      /export function resolveWishlistEmptyBody\(\)[^{]*\{[^}]*return\s+"([^"]*)"/,
    );
    if (!bodyMatch || bodyMatch[1].trim().length === 0) {
      violations.push(
        `${wishlistLogicPath}: resolveWishlistEmptyBody must return a one-sentence Danish body`,
      );
    }
  }

  if (testExists) {
    const testSource = overrides.testSource ?? readFileSync(wishlistTestPath, "utf8");
    if (!testSource.includes("wishlist-sheet-logic")) {
      violations.push(`${wishlistTestPath}: must import from wishlist-sheet-logic`);
    }
    for (const marker of REQUIRED_TEST_MARKERS) {
      if (!testSource.includes(marker)) {
        violations.push(`${wishlistTestPath}: missing evidence marker "${marker}"`);
      }
    }
  }

  if (existsSync(wishlistServicePath)) {
    const serviceSource = overrides.serviceSource ?? readFileSync(wishlistServicePath, "utf8");
    const writeToValuesBlock = serviceSource.match(
      /writeToValues\([^)]*\)[^{]*\{([\s\S]*?)\n\s*\}/,
    );
    if (writeToValuesBlock) {
      const body = writeToValuesBlock[1];
      if (/\bid\s*:/.test(body) || /\buserId\s*:/.test(body)) {
        violations.push(
          `${wishlistServicePath}: writeToValues must return criteria fields only — no dummy id/userId`,
        );
      }
    }
    if (!serviceSource.includes("WishlistCriteriaValues")) {
      violations.push(
        `${wishlistServicePath}: writeToValues must return WishlistCriteriaValues, not WishlistRow`,
      );
    }
  }

  if (existsSync(domainWishlistPath)) {
    const domainSource = overrides.domainSource ?? readFileSync(domainWishlistPath, "utf8");
    const narratingJsdoc =
      /\/\*\*[\s\S]*?(hasWishlistCriterion|buildWishlistAndMeta|buildWishlistAutoName)[\s\S]*?\*\//.test(
        domainSource,
      );
    if (narratingJsdoc) {
      violations.push(
        `${domainWishlistPath}: remove narrating JSDoc that restates function signatures`,
      );
    }
  }

  return violations;
}

const violations = checkMobileWishlistUiEvidence();

if (violations.length > 0) {
  console.error("Mobile wishlist UI evidence ratchet failed:\n");
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  process.exit(1);
}

console.log("Mobile wishlist UI evidence check passed.");
