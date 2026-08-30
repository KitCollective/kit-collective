#!/usr/bin/env node
/**
 * Ratchet (KIT-134): fail CI when paywall IAP wiring regresses — missing store SDK
 * dependency, wrong Button dock variants, or hardcoded display prices.
 */
import { existsSync, readFileSync } from "node:fs";

const PAYWALL_SHEET_PATH = "apps/mobile/src/components/paywall-sheet.tsx";
const MOBILE_PACKAGE_PATH = "apps/mobile/package.json";
const STORE_BILLING_CLIENT_PATH = "apps/mobile/src/premium/store-billing-client.ts";

/**
 * @param {{ paywallSource?: string, mobilePackageSource?: string, storeBillingClientSource?: string }} overrides
 * @returns {string[]}
 */
export function checkMobilePaywallIap(overrides = {}) {
  const violations = [];

  if (!existsSync(PAYWALL_SHEET_PATH)) {
    return violations;
  }

  const paywallSource = overrides.paywallSource ?? readFileSync(PAYWALL_SHEET_PATH, "utf8");
  const mobilePackageSource =
    overrides.mobilePackageSource ?? readFileSync(MOBILE_PACKAGE_PATH, "utf8");
  const storeBillingClientSource =
    overrides.storeBillingClientSource ??
    (existsSync(STORE_BILLING_CLIENT_PATH) ? readFileSync(STORE_BILLING_CLIENT_PATH, "utf8") : "");

  if (!/"react-native-iap"\s*:/.test(mobilePackageSource)) {
    violations.push(
      `${MOBILE_PACKAGE_PATH}: paywall slice must declare react-native-iap — store SDK prices cannot load without it`,
    );
  }

  if (!paywallSource.includes("typography.mono")) {
    violations.push(
      `${PAYWALL_SHEET_PATH}: paywall prices must use typography.mono per design lock`,
    );
  }

  if (/29\s*kr/i.test(paywallSource)) {
    violations.push(
      `${PAYWALL_SHEET_PATH}: display price must come from the store SDK, not hardcoded kroner`,
    );
  }

  const dockChecks = [
    { label: "Månedlig", variant: "primary" },
    { label: "Årlig", variant: "secondary" },
    { label: "Gendan køb", variant: "tertiary" },
  ];

  for (const { label, variant } of dockChecks) {
    const pattern = new RegExp(`label="${label}"[\\s\\S]*?variant="${variant}"`);
    if (!pattern.test(paywallSource)) {
      violations.push(
        `${PAYWALL_SHEET_PATH}: "${label}" must use Button variant="${variant}" in the paywall dock`,
      );
    }
  }

  if (
    storeBillingClientSource.includes('require("./native-store-billing")') &&
    !/SAFETY:/.test(storeBillingClientSource)
  ) {
    violations.push(
      `${STORE_BILLING_CLIENT_PATH}: native IAP require() needs a SAFETY: justification for anti-slop`,
    );
  }

  return violations;
}

export function checkMobilePaywallIapFromDisk() {
  return checkMobilePaywallIap({});
}

function main() {
  const violations = checkMobilePaywallIapFromDisk();
  if (violations.length > 0) {
    console.error("Mobile paywall IAP ratchet failed:\n");
    for (const violation of violations) {
      console.error(`  - ${violation}`);
    }
    process.exit(1);
  }

  console.log("Mobile paywall IAP check passed.");
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main();
}
