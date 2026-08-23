#!/usr/bin/env node
/**
 * Ratchet (KIT-43): fail CI when collection genveje UI ships without the locked
 * mechanical evidence path (pure logic module + vitest) around expo-sqlite web blockers.
 */
import { existsSync, readFileSync } from "node:fs";

const genvejeSheetPath = "apps/mobile/src/components/genveje-sheet.tsx";
const genvejeLogicPath = "apps/mobile/src/components/genveje-sheet-logic.ts";
const genvejeTestPath = "apps/mobile/tests/genveje-sheet.test.ts";

const REQUIRED_LOGIC_EXPORTS = [
  "resolveGenvejeSheetTitle",
  "canSaveGenvej",
  "seedClubForEdit",
  "manageRowAccessibilityLabel",
  "shouldResetShortcutAfterDelete",
  "shouldFallbackToAlleOnFetchError",
];

const REQUIRED_TEST_MARKERS = [
  "resolveGenvejeSheetTitle",
  "canSaveGenvej",
  "seedClubForEdit",
  "manageRowAccessibilityLabel",
  "shouldResetShortcutAfterDelete",
  "shouldFallbackToAlleOnFetchError",
  "Genveje",
  "Ny genvej",
  "Flyt",
];

export function checkMobileCollectionUiEvidence(overrides = {}) {
  const violations = [];

  if (!existsSync(genvejeSheetPath)) {
    return violations;
  }

  const sheetSource = overrides.sheetSource ?? readFileSync(genvejeSheetPath, "utf8");
  const logicExists = overrides.logicExists ?? existsSync(genvejeLogicPath);
  const testExists = overrides.testExists ?? existsSync(genvejeTestPath);

  if (!logicExists) {
    violations.push(`${genvejeLogicPath}: required pure logic module for genveje UI evidence`);
  }

  if (!testExists) {
    violations.push(`${genvejeTestPath}: required vitest evidence for genveje UI ACs`);
  }

  if (!sheetSource.includes("genveje-sheet-logic")) {
    violations.push(`${genvejeSheetPath}: must import shared logic from genveje-sheet-logic`);
  }

  if (!sheetSource.includes('accessibilityLabel="Flyt"')) {
    violations.push(`${genvejeSheetPath}: manage drag-handle must be named Flyt`);
  }

  if (logicExists) {
    const logicSource = overrides.logicSource ?? readFileSync(genvejeLogicPath, "utf8");
    for (const exportName of REQUIRED_LOGIC_EXPORTS) {
      if (!logicSource.includes(`export function ${exportName}`)) {
        violations.push(`${genvejeLogicPath}: missing export ${exportName}`);
      }
    }
  }

  if (testExists) {
    const testSource = overrides.testSource ?? readFileSync(genvejeTestPath, "utf8");
    if (!testSource.includes("genveje-sheet-logic")) {
      violations.push(`${genvejeTestPath}: must import from genveje-sheet-logic`);
    }
    for (const marker of REQUIRED_TEST_MARKERS) {
      if (!testSource.includes(marker)) {
        violations.push(`${genvejeTestPath}: missing evidence marker "${marker}"`);
      }
    }
  }

  return violations;
}

const violations = checkMobileCollectionUiEvidence();

if (violations.length > 0) {
  console.error("Mobile collection UI evidence ratchet failed:\n");
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  process.exit(1);
}

console.log("Mobile collection UI evidence check passed.");
