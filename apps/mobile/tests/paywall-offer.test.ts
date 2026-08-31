import type { Entitlement } from "@kit/api-contract";
import { OFFER_PRODUCT_IDS } from "@kit/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadPaywallOfferState,
  purchasePaywallProduct,
  restorePaywallPurchases,
  setPaywallBillingApiForTests,
} from "../src/premium/paywall-offer";
import type { StoreBillingClient } from "../src/premium/store-billing";
import { setStoreBillingClientForTests } from "../src/premium/store-billing-client";

const entitlement: Entitlement = {
  live: true,
  source: "iap_apple",
  expires: "2026-09-02T12:00:00.000Z",
  trialUsed: true,
};

const verifyIapPurchase = vi.fn();
const restoreIapPurchases = vi.fn();

function mockClient(overrides: Partial<StoreBillingClient> = {}): StoreBillingClient {
  return {
    iapAvailable: true,
    fetchProductPrices: vi.fn().mockResolvedValue([
      { productId: OFFER_PRODUCT_IDS.month, localizedPrice: "29,00 kr." },
      { productId: OFFER_PRODUCT_IDS.year, localizedPrice: "249,00 kr." },
    ]),
    purchaseProduct: vi.fn().mockResolvedValue({
      token: "tok",
      platform: "apple",
      productId: OFFER_PRODUCT_IDS.month,
    }),
    restorePurchases: vi.fn().mockResolvedValue({
      token: "tok",
      platform: "apple",
      productId: OFFER_PRODUCT_IDS.month,
    }),
    ...overrides,
  };
}

describe("loadPaywallOfferState", () => {
  afterEach(() => {
    setStoreBillingClientForTests(null);
    setPaywallBillingApiForTests(null);
    vi.clearAllMocks();
  });

  it("returns web-unavailable state when IAP is not available", async () => {
    setStoreBillingClientForTests(
      mockClient({
        iapAvailable: false,
      }),
    );

    const state = await loadPaywallOfferState();
    expect(state.iapAvailable).toBe(false);
    expect(state.webUnavailableMessage).toContain("iOS- og Android-appen");
    expect(state.monthPrice).toBeNull();
    expect(state.yearPrice).toBeNull();
  });

  it("loads localized prices from the billing client", async () => {
    setStoreBillingClientForTests(mockClient());

    const state = await loadPaywallOfferState();
    expect(state).toEqual({
      iapAvailable: true,
      webUnavailableMessage: null,
      monthPrice: "29,00 kr.",
      yearPrice: "249,00 kr.",
    });
  });
});

describe("paywall purchase flow", () => {
  afterEach(() => {
    setStoreBillingClientForTests(null);
    setPaywallBillingApiForTests(null);
    vi.clearAllMocks();
  });

  it("verifies IAP purchase through billing API", async () => {
    const client = mockClient();
    setStoreBillingClientForTests(client);
    verifyIapPurchase.mockResolvedValue(entitlement);
    setPaywallBillingApiForTests({ verifyIapPurchase, restoreIapPurchases });

    const result = await purchasePaywallProduct("token", OFFER_PRODUCT_IDS.month);

    expect(client.purchaseProduct).toHaveBeenCalledWith(OFFER_PRODUCT_IDS.month);
    expect(verifyIapPurchase).toHaveBeenCalledWith("token", {
      platform: "apple",
      productId: OFFER_PRODUCT_IDS.month,
      token: "tok",
    });
    expect(result).toEqual(entitlement);
  });

  it("restores purchases through billing API", async () => {
    const client = mockClient();
    setStoreBillingClientForTests(client);
    restoreIapPurchases.mockResolvedValue(entitlement);
    setPaywallBillingApiForTests({ verifyIapPurchase, restoreIapPurchases });

    const result = await restorePaywallPurchases("token");

    expect(client.restorePurchases).toHaveBeenCalled();
    expect(restoreIapPurchases).toHaveBeenCalledWith("token", {
      platform: "apple",
      token: "tok",
    });
    expect(result).toEqual(entitlement);
  });
});
