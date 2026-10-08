#!/usr/bin/env node
/**
 * Ratchet (KIT-134): fail CI when paywall IAP wiring regresses — missing store SDK
 * seam, wrong Button dock variants, or hardcoded display prices.
 */
import { existsSync, readFileSync } from "node:fs";

const PAYWALL_SHEET_PATH = "apps/mobile/src/components/paywall-sheet.tsx";
const MOBILE_PACKAGE_PATH = "apps/mobile/package.json";
const NATIVE_STORE_BILLING_PATH = "apps/mobile/src/premium/native-store-billing.ts";
const STORE_BILLING_CLIENT_PATH = "apps/mobile/src/premium/store-billing-client.ts";
const AMBIENT_IAP_STUB_PATH = "apps/mobile/src/premium/react-native-iap.d.ts";

/**
 * @param {{
 *   paywallSource?: string,
 *   mobilePackageJson?: string,
 *   nativeStoreBillingSource?: string,
 *   storeBillingClientSource?: string,
 * }} overrides
 * @returns {string[]}
 */
export function checkMobilePaywallIap(overrides = {}) {
  const violations = [];

  if (!existsSync(PAYWALL_SHEET_PATH)) {
    return violations;
  }

  const paywallSource = overrides.paywallSource ?? readFileSync(PAYWALL_SHEET_PATH, "utf8");
  const mobilePackageJson =
    overrides.mobilePackageJson ??
    (existsSync(MOBILE_PACKAGE_PATH) ? readFileSync(MOBILE_PACKAGE_PATH, "utf8") : "");
  const nativeStoreBillingSource =
    overrides.nativeStoreBillingSource ??
    (existsSync(NATIVE_STORE_BILLING_PATH) ? readFileSync(NATIVE_STORE_BILLING_PATH, "utf8") : "");
  const storeBillingClientSource =
    overrides.storeBillingClientSource ??
    (existsSync(STORE_BILLING_CLIENT_PATH) ? readFileSync(STORE_BILLING_CLIENT_PATH, "utf8") : "");

  if (existsSync(AMBIENT_IAP_STUB_PATH)) {
    violations.push(
      `${AMBIENT_IAP_STUB_PATH}: delete hand-rolled declare module stub; declare react-native-iap in apps/mobile/package.json`,
    );
  }

  /** @type {{ dependencies?: Record<string, string> }} */
  let mobilePackage = {};
  try {
    mobilePackage = JSON.parse(mobilePackageJson);
  } catch {
    violations.push(`${MOBILE_PACKAGE_PATH}: invalid package.json`);
  }

  if (!mobilePackage.dependencies?.["react-native-iap"]) {
    violations.push(
      `${MOBILE_PACKAGE_PATH}: must declare react-native-iap so native store billing can load the store SDK`,
    );
  }

  if (
    !nativeStoreBillingSource.includes('require("react-native-iap")') ||
    !/SAFETY:/.test(nativeStoreBillingSource)
  ) {
    violations.push(
      `${NATIVE_STORE_BILLING_PATH}: native store billing must load react-native-iap with a SAFETY: justification`,
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
