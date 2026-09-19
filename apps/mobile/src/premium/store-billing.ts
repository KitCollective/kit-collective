import type { IapPlatform } from "@kit/api-contract";
import { OFFER_PRODUCT_IDS } from "@kit/domain";

export type StoreProductPrice = {
  productId: string;
  localizedPrice: string;
};

export type StorePurchaseResult = {
  token: string;
  platform: IapPlatform;
  productId: string;
};

export type StoreBillingClient = {
  readonly iapAvailable: boolean;
  fetchProductPrices(productIds: readonly string[]): Promise<StoreProductPrice[]>;
  purchaseProduct(productId: string): Promise<StorePurchaseResult>;
  restorePurchases(): Promise<StorePurchaseResult | null>;
};

export const PAYWALL_PRODUCT_IDS = [OFFER_PRODUCT_IDS.month, OFFER_PRODUCT_IDS.year] as const;

export function mapProductPricesById(prices: readonly StoreProductPrice[]): Record<string, string> {
  return Object.fromEntries(prices.map((price) => [price.productId, price.localizedPrice]));
}
