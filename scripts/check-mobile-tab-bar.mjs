#!/usr/bin/env node
/**
 * Ratchet (KIT-42): fail CI when the Expo tab bar omits the locked five-slot
 * icon-only glass pill (docs/design-system.md Tab bar, Gap 2026-08-23).
 */
import { readFileSync } from "node:fs";

const tabLayoutPath = "apps/mobile/app/(tabs)/_layout.tsx";
const floatingBarPath = "apps/mobile/src/components/floating-tab-bar.tsx";
const violations = [];

const layoutSource = readFileSync(tabLayoutPath, "utf8");
const barSource = readFileSync(floatingBarPath, "utf8");

if (!layoutSource.includes("FloatingTabBar")) {
  violations.push(`${tabLayoutPath}: must render FloatingTabBar as the custom tab bar`);
}

if (!layoutSource.includes("href: null")) {
  violations.push(`${tabLayoutPath}: add route must be hidden from the tab bar (href: null)`);
}

if (/tabBarLabel\s*:/.test(layoutSource)) {
  violations.push(`${tabLayoutPath}: tab bar must be icon-only (no tabBarLabel in screen options)`);
}

const requiredAccessibleNames = [
  "Samling",
  "Søg",
  "Tilføj trøje",
  "Ønske",
  "Profil",
];
for (const name of requiredAccessibleNames) {
  if (!barSource.includes(name)) {
    violations.push(`${floatingBarPath}: missing Danish accessible name "${name}"`);
  }
}

if (!barSource.includes('accessibilityRole="button"') || !barSource.includes("Tilføj trøje")) {
  violations.push(`${floatingBarPath}: center plus must be a button named Tilføj trøje`);
}

if (violations.length > 0) {
  console.error("Mobile tab bar ratchet failed:\n");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log("Mobile tab bar check passed.");
