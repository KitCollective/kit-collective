#!/usr/bin/env node
/**
 * Ratchet (KIT-44): fail CI when collection shortcut drag-reorder uses banned
 * primitives (PanResponder / per-frame setState) or undersized drag handles.
 */
import { existsSync, readFileSync } from "node:fs";

const genvejeSheetPath = "apps/mobile/src/components/genveje-sheet.tsx";

export function checkMobileDragReorder(overrides = {}) {
  const violations = [];

  if (!existsSync(genvejeSheetPath)) {
    return violations;
  }

  const sheetSource = overrides.sheetSource ?? readFileSync(genvejeSheetPath, "utf8");

  if (sheetSource.includes("PanResponder")) {
    violations.push(
      `${genvejeSheetPath}: custom drag-reorder must use Gesture.Pan() from react-native-gesture-handler, not PanResponder`,
    );
  }

  if (!sheetSource.includes("react-native-gesture-handler")) {
    violations.push(
      `${genvejeSheetPath}: custom drag-reorder must import react-native-gesture-handler`,
    );
  }

  if (!sheetSource.includes("react-native-reanimated")) {
    violations.push(
      `${genvejeSheetPath}: custom drag-reorder must use react-native-reanimated shared values for drag offset`,
    );
  }

  if (!sheetSource.includes("useSharedValue")) {
    violations.push(
      `${genvejeSheetPath}: drag offset must use useSharedValue, not per-frame setState`,
    );
  }

  const dragHandleBlock = sheetSource.match(/dragHandle:\s*\{[^}]+\}/s);
  if (!dragHandleBlock) {
    violations.push(`${genvejeSheetPath}: missing dragHandle style for reorder grab target`);
  } else {
    const block = dragHandleBlock[0];
    const hasMinWidth44 = /minWidth:\s*44/.test(block);
    const hasMinHeight44 = /minHeight:\s*44/.test(block);
    if (!hasMinWidth44 || !hasMinHeight44) {
      violations.push(
        `${genvejeSheetPath}: dragHandle must meet the 44×44 hit-target floor (minWidth/minHeight 44)`,
      );
    }
  }

  if (!sheetSource.includes('accessibilityLabel="Flyt"')) {
    violations.push(`${genvejeSheetPath}: manage drag-handle must be named Flyt`);
  }

  return violations;
}

function main() {
  const violations = checkMobileDragReorder();
  if (violations.length > 0) {
    console.error("Mobile drag-reorder ratchet failed:\n");
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    process.exit(1);
  }

  console.log("Mobile drag-reorder ratchet passed.");
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main();
}
