#!/usr/bin/env node
/**
 * Ratchet (KIT-23): fail CI when the Expo tab bar layout omits tabBarIcon on
 * documented Collection/Add tabs (docs/design-system.md Tab bar anatomy).
 */
import { readFileSync } from "node:fs";

const tabLayoutPath = "apps/mobile/app/(tabs)/_layout.tsx";
const violations = [];

const source = readFileSync(tabLayoutPath, "utf8");

if (!source.includes("tabBarIcon")) {
  violations.push(
    `${tabLayoutPath}: Tab bar must set tabBarIcon (icon + label per design-system.md Tab bar anatomy)`,
  );
}

const iconCount = (source.match(/tabBarIcon/g) ?? []).length;
if (iconCount < 2) {
  violations.push(
    `${tabLayoutPath}: expected tabBarIcon on at least Collection and Add tabs (found ${iconCount})`,
  );
}

if (violations.length > 0) {
  console.error("Mobile tab bar ratchet failed:\n");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log("Mobile tab bar check passed.");
