import type { Entitlement } from "@kit/api-contract";
import { OFFER_PRODUCT_IDS } from "@kit/domain";
import { restoreIapPurchases, verifyIapPurchase } from "@/api/billing";
import {
  mapProductPricesById,
  PAYWALL_PRODUCT_IDS,
  type StoreProductPrice,
} from "@/premium/store-billing";
import {
  createStoreBillingClient,
  getWebIapUnavailableMessage,
} from "@/premium/store-billing-client";

export type PaywallOfferState = {
  iapAvailable: boolean;
  webUnavailableMessage: string | null;
  monthPrice: string | null;
  yearPrice: string | null;
};

export async function loadPaywallOfferState(): Promise<PaywallOfferState> {
  const client = createStoreBillingClient();
  if (!client.iapAvailable) {
    return {
      iapAvailable: false,
      webUnavailableMessage: getWebIapUnavailableMessage(),
      monthPrice: null,
      yearPrice: null,
    };
  }

  const prices = await client.fetchProductPrices(PAYWALL_PRODUCT_IDS);
  const byId = mapProductPricesById(prices);
  return {
    iapAvailable: true,
    webUnavailableMessage: null,
    monthPrice: byId[OFFER_PRODUCT_IDS.month] ?? null,
    yearPrice: byId[OFFER_PRODUCT_IDS.year] ?? null,
  };
}

export async function purchasePaywallProduct(
  accessToken: string,
  productId: string,
): Promise<Entitlement> {
  const client = createStoreBillingClient();
  const purchase = await client.purchaseProduct(productId);
  return verifyIapPurchase(accessToken, {
    platform: purchase.platform,
    productId: purchase.productId,
    token: purchase.token,
  });
}

export async function restorePaywallPurchases(accessToken: string): Promise<Entitlement> {
  const client = createStoreBillingClient();
  const restored = await client.restorePurchases();
  if (!restored) {
    throw new Error("Ingen tidligere køb fundet");
  }

  return restoreIapPurchases(accessToken, {
    platform: restored.platform,
    token: restored.token,
  });
}

export function formatPaywallPrices(prices: readonly StoreProductPrice[]): PaywallOfferState {
  const byId = mapProductPricesById(prices);
  return {
    iapAvailable: true,
    webUnavailableMessage: null,
    monthPrice: byId[OFFER_PRODUCT_IDS.month] ?? null,
    yearPrice: byId[OFFER_PRODUCT_IDS.year] ?? null,
  };
}
