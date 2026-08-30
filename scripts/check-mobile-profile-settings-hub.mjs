#!/usr/bin/env node
/**
 * Ratchet (KIT-125): fail CI when own-Profil Indstillinger hub drifts from
 * docs/design-system.md §5 (four mono section labels, account Skift wiring,
 * Danish prefs drills — not factory jargon).
 */
import { readFileSync } from "node:fs";

const indstillingerPath = "apps/mobile/app/(tabs)/profile/indstillinger.tsx";
const kontoPath = "apps/mobile/app/(tabs)/profile/kontoindstillinger.tsx";

const REQUIRED_SECTION_LABELS = [
  "Profiloplysninger / Kontoindstillinger",
  "Push-notifikationer / E-mail-notifikationer",
  "Sprog / Mørk tilstand",
  "Privatlivsindstillinger",
];

const PREFS_SCREENS = [
  "apps/mobile/app/(tabs)/profile/push-notifikationer.tsx",
  "apps/mobile/app/(tabs)/profile/email-notifikationer.tsx",
  "apps/mobile/app/(tabs)/profile/sprog.tsx",
  "apps/mobile/app/(tabs)/profile/moerk-tilstand.tsx",
  "apps/mobile/app/(tabs)/profile/privatlivsindstillinger.tsx",
];

const FACTORY_JARGON = [
  /\bshell\b/i,
  /\bplaceholder\b/i,
  /\bstub\b/i,
  /\bgap slice\b/i,
  /\bmilestone\b/i,
  /\bprefs slice\b/i,
];

/**
 * @param {Record<string, string>} [overrides]
 * @returns {string[]}
 */
export function checkMobileProfileSettingsHub(overrides = {}) {
  const violations = [];

  const indstillinger = overrides.indstillingerSource ?? readFileSync(indstillingerPath, "utf8");
  const konto = overrides.kontoSource ?? readFileSync(kontoPath, "utf8");

  const sectionLabelCount = (indstillinger.match(/<SettingsSectionLabel>/g) ?? []).length;
  if (sectionLabelCount !== 4) {
    violations.push(
      `${indstillingerPath}: Indstillinger hub must have four SettingsSectionLabel groups (found ${sectionLabelCount})`,
    );
  }

  for (const label of REQUIRED_SECTION_LABELS) {
    if (!indstillinger.includes(`<SettingsSectionLabel>${label}</SettingsSectionLabel>`)) {
      violations.push(`${indstillingerPath}: missing mono section label "${label}"`);
    }
  }

  if (!/router\.push\("\/\(tabs\)\/profile\/skift-email"\)/.test(konto)) {
    violations.push(`${kontoPath}: email Skift must navigate to skift-email`);
  }

  if (!/title="Telefon"[\s\S]*actionLabel="Skift"/.test(konto)) {
    violations.push(`${kontoPath}: phone row must use trailing Skift action`);
  }

  if (/lock-speak|private account field|design lock/i.test(konto)) {
    violations.push(`${kontoPath}: fullName helper must not use lock-speak or factory jargon`);
  }

  for (const screenPath of PREFS_SCREENS) {
    const source = overrides[`prefs:${screenPath}`] ?? readFileSync(screenPath, "utf8");
    for (const pattern of FACTORY_JARGON) {
      if (pattern.test(source)) {
        violations.push(`${screenPath}: prefs drill must not use factory jargon (${pattern})`);
      }
    }
  }

  return violations;
}

function main() {
  const violations = checkMobileProfileSettingsHub();
  if (violations.length === 0) {
    console.log("check-mobile-profile-settings-hub: ok");
    return;
  }

  console.error("check-mobile-profile-settings-hub: violations:");
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  process.exit(1);
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main();
}
