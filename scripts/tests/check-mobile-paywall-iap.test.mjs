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

const compliantNativeStoreBilling = `
// SAFETY: createStoreBillingClient only loads this module on iOS/Android.
return require("react-native-iap") as IapModule;
`;

const compliantStoreClient = `
// SAFETY: only called when Platform.OS is ios/android.
require("./native-store-billing")
`;

describe("checkMobilePaywallIap", () => {
  it("passes compliant paywall IAP wiring", () => {
    assert.deepEqual(
      checkMobilePaywallIap({
        paywallSource: compliantPaywall,
        nativeStoreBillingSource: compliantNativeStoreBilling,
        storeBillingClientSource: compliantStoreClient,
      }),
      [],
    );
  });

  it("fails when native store billing omits react-native-iap require", () => {
    const violations = checkMobilePaywallIap({
      paywallSource: compliantPaywall,
      nativeStoreBillingSource: "// SAFETY: stub without IAP module",
      storeBillingClientSource: compliantStoreClient,
    });
    assert.ok(violations.some((line) => line.includes("react-native-iap")));
  });

  it("fails when Restore uses secondary instead of tertiary", () => {
    const violations = checkMobilePaywallIap({
      paywallSource: compliantPaywall.replace('variant="tertiary"', 'variant="secondary"'),
      nativeStoreBillingSource: compliantNativeStoreBilling,
      storeBillingClientSource: compliantStoreClient,
    });
    assert.ok(violations.some((line) => line.includes("Gendan køb")));
  });

  it("fails when hardcoded kroner appears in paywall", () => {
    const violations = checkMobilePaywallIap({
      paywallSource: `${compliantPaywall}\n29 kr`,
      nativeStoreBillingSource: compliantNativeStoreBilling,
      storeBillingClientSource: compliantStoreClient,
    });
    assert.ok(violations.some((line) => line.includes("hardcoded")));
  });

  it("fails when native require lacks SAFETY justification", () => {
    const violations = checkMobilePaywallIap({
      paywallSource: compliantPaywall,
      nativeStoreBillingSource: compliantNativeStoreBilling,
      storeBillingClientSource: 'require("./native-store-billing")',
    });
    assert.ok(violations.some((line) => line.includes("SAFETY")));
  });
});
