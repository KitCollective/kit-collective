#!/usr/bin/env node
/**
 * Ratchet (KIT-42): fail CI when the Expo bottom navigation drifts from the locked
 * native-tabs design (docs/design-system.md → Tab bar, Gap 2026-09-05). The bar is
 * `NativeTabs` (iOS 26 Liquid Glass) with five labelled tabs in a fixed order,
 * Søg in the center, and capture living as the Samling header action — never a tab.
 */
import { readFileSync } from "node:fs";

const tabLayoutPath = "apps/mobile/app/(tabs)/_layout.tsx";
const collectionHeaderPath = "apps/mobile/src/components/collection-header.tsx";

const EXPECTED_TAB_ORDER = ["collection", "inbox", "search", "wishlist", "profile"];
const EXPECTED_LABELS = ["Samling", "Indbakke", "Søg", "Ønsker", "Profil"];

/** Ordered list of NativeTabs.Trigger route names as declared in the layout. */
export function tabTriggerNames(source) {
  return [...source.matchAll(/<NativeTabs\.Trigger\s+name="([^"]+)"/g)].map((match) => match[1]);
}

export function checkMobileTabBar(overrides = {}) {
  const violations = [];

  const layoutSource = overrides.layoutSource ?? readFileSync(tabLayoutPath, "utf8");
  const headerSource = overrides.headerSource ?? readFileSync(collectionHeaderPath, "utf8");

  if (!layoutSource.includes("NativeTabs")) {
    violations.push(
      `${tabLayoutPath}: must render NativeTabs (native system Liquid Glass tab bar)`,
    );
  }

  if (layoutSource.includes("FloatingTabBar")) {
    violations.push(
      `${tabLayoutPath}: custom FloatingTabBar was replaced by NativeTabs — do not reintroduce it`,
    );
  }

  const names = tabTriggerNames(layoutSource);
  if (names.join(",") !== EXPECTED_TAB_ORDER.join(",")) {
    violations.push(
      `${tabLayoutPath}: expected five tabs in order ${EXPECTED_TAB_ORDER.join(", ")} (found: ${names.join(", ") || "none"})`,
    );
  }

  if (names[2] !== "search") {
    violations.push(`${tabLayoutPath}: Søg (search) must be the center tab`);
  }

  for (const label of EXPECTED_LABELS) {
    if (!layoutSource.includes(`>${label}<`)) {
      violations.push(`${tabLayoutPath}: missing Danish tab label "${label}"`);
    }
  }

  if (names.includes("add") || names.includes("capture")) {
    violations.push(
      `${tabLayoutPath}: capture must not be a tab — it is the Samling header action`,
    );
  }

  if (!headerSource.includes('name="Tilføj trøje"') || !headerSource.includes('icon="add"')) {
    violations.push(
      `${collectionHeaderPath}: capture must be the Samling header button named "Tilføj trøje" with the add icon`,
    );
  }

  return violations;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const violations = checkMobileTabBar();

  if (violations.length > 0) {
    console.error("Mobile tab bar ratchet failed:\n");
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }

  console.log("Mobile tab bar check passed.");
}
