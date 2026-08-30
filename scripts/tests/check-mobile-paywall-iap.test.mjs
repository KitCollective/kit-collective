import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkMobilePaywallIap } from "../check-mobile-paywall-iap.mjs";

const compliantPaywall = `
<Button label="Månedlig" variant="primary" />
<Button label="Årlig" variant="secondary" />
<Button label="Gendan køb" variant="tertiary" />
typography.mono
webUnavailableMessage
`;

const compliantPackage = `"react-native-iap": "^12.16.2"`;

const compliantStoreClient = `
// SAFETY: only called when Platform.OS is ios/android.
require("./native-store-billing")
`;

describe("checkMobilePaywallIap", () => {
  it("passes compliant paywall IAP wiring", () => {
    assert.deepEqual(
      checkMobilePaywallIap({
        paywallSource: compliantPaywall,
        mobilePackageSource: compliantPackage,
        storeBillingClientSource: compliantStoreClient,
      }),
      [],
    );
  });

  it("fails when react-native-iap is missing from package.json", () => {
    const violations = checkMobilePaywallIap({
      paywallSource: compliantPaywall,
      mobilePackageSource: "{}",
      storeBillingClientSource: compliantStoreClient,
    });
    assert.ok(violations.some((line) => line.includes("react-native-iap")));
  });

  it("fails when Restore uses secondary instead of tertiary", () => {
    const violations = checkMobilePaywallIap({
      paywallSource: compliantPaywall.replace('variant="tertiary"', 'variant="secondary"'),
      mobilePackageSource: compliantPackage,
      storeBillingClientSource: compliantStoreClient,
    });
    assert.ok(violations.some((line) => line.includes("Gendan køb")));
  });

  it("fails when hardcoded kroner appears in paywall", () => {
    const violations = checkMobilePaywallIap({
      paywallSource: `${compliantPaywall}\n29 kr`,
      mobilePackageSource: compliantPackage,
      storeBillingClientSource: compliantStoreClient,
    });
    assert.ok(violations.some((line) => line.includes("hardcoded")));
  });

  it("fails when native require lacks SAFETY justification", () => {
    const violations = checkMobilePaywallIap({
      paywallSource: compliantPaywall,
      mobilePackageSource: compliantPackage,
      storeBillingClientSource: 'require("./native-store-billing")',
    });
    assert.ok(violations.some((line) => line.includes("SAFETY")));
  });
});
