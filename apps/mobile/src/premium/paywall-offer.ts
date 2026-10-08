import type { Entitlement, IapRestoreRequest, IapVerifyRequest } from "@kit/api-contract";
import { OFFER_PRODUCT_IDS } from "@kit/domain";
import { mapProductPricesById, PAYWALL_PRODUCT_IDS } from "@/premium/store-billing";
import {
  createStoreBillingClient,
  getWebIapUnavailableMessage,
} from "@/premium/store-billing-client";

type PaywallBillingApi = {
  verifyIapPurchase(accessToken: string, body: IapVerifyRequest): Promise<Entitlement>;
  restoreIapPurchases(accessToken: string, body: IapRestoreRequest): Promise<Entitlement>;
};

let billingApiOverride: PaywallBillingApi | null = null;
let defaultBillingApi: PaywallBillingApi | null = null;

export function setPaywallBillingApiForTests(api: PaywallBillingApi | null): void {
  billingApiOverride = api;
}

function billingApi(): PaywallBillingApi {
  if (billingApiOverride) {
    return billingApiOverride;
  }

  if (!defaultBillingApi) {
    // SAFETY: production paywall flows call billing only after store purchase; tests inject billingApiOverride.
    defaultBillingApi = require("@/api/billing") as PaywallBillingApi;
  }

  return defaultBillingApi;
}

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
  return billingApi().verifyIapPurchase(accessToken, {
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

  return billingApi().restoreIapPurchases(accessToken, {
    platform: restored.platform,
    token: restored.token,
  });
}
