import type { IapPlatform } from "@kit/api-contract";
import { Platform } from "react-native";
import type { ProductPurchase, Purchase, SubscriptionPurchase } from "react-native-iap";
import type {
  StoreBillingClient,
  StoreProductPrice,
  StorePurchaseResult,
} from "./store-billing.js";

type IapModule = typeof import("react-native-iap");

type PendingPurchase = {
  resolve: (value: StorePurchaseResult) => void;
  reject: (error: Error) => void;
  productId: string;
};

function loadIapModule(): IapModule {
  // SAFETY: createStoreBillingClient only loads this module on iOS/Android.
  return require("react-native-iap") as IapModule;
}

function platformForStore(): IapPlatform {
  return Platform.OS === "ios" ? "apple" : "google";
}

function purchaseToken(purchase: Purchase | ProductPurchase | SubscriptionPurchase): string {
  if ("transactionReceipt" in purchase && purchase.transactionReceipt) {
    return purchase.transactionReceipt;
  }

  if ("purchaseToken" in purchase && purchase.purchaseToken) {
    return purchase.purchaseToken;
  }

  throw new Error("Store purchase did not include a receipt token");
}

export class NativeStoreBillingClient implements StoreBillingClient {
  readonly iapAvailable = true;
  private connected = false;
  private pending: PendingPurchase | null = null;
  private purchaseSub: ReturnType<IapModule["purchaseUpdatedListener"]> | null = null;
  private errorSub: ReturnType<IapModule["purchaseErrorListener"]> | null = null;

  private async ensureConnected(): Promise<void> {
    if (this.connected) {
      return;
    }

    const iap = loadIapModule();
    await iap.initConnection();
    this.connected = true;

    this.purchaseSub = iap.purchaseUpdatedListener(async (purchase) => {
      const pending = this.pending;
      if (!pending) {
        return;
      }

      try {
        await iap.finishTransaction({ purchase, isConsumable: false });
        pending.resolve({
          token: purchaseToken(purchase),
          platform: platformForStore(),
          productId: pending.productId,
        });
      } catch (error) {
        pending.reject(error instanceof Error ? error : new Error("Purchase failed"));
      } finally {
        this.pending = null;
      }
    });

    this.errorSub = iap.purchaseErrorListener((error) => {
      const pending = this.pending;
      if (!pending) {
        return;
      }

      pending.reject(new Error(error.message));
      this.pending = null;
    });
  }

  async fetchProductPrices(productIds: readonly string[]): Promise<StoreProductPrice[]> {
    const iap = loadIapModule();
    await this.ensureConnected();
    const products = await iap.getProducts({ skus: [...productIds] });
    return products.map((product) => ({
      productId: product.productId,
      localizedPrice: product.localizedPrice,
    }));
  }

  async purchaseProduct(productId: string): Promise<StorePurchaseResult> {
    const iap = loadIapModule();
    await this.ensureConnected();

    return new Promise<StorePurchaseResult>((resolve, reject) => {
      this.pending = { resolve, reject, productId };
      void iap.requestPurchase({ sku: productId }).catch((error: unknown) => {
        this.pending = null;
        reject(error instanceof Error ? error : new Error("Purchase failed"));
      });
    });
  }

  async restorePurchases(): Promise<StorePurchaseResult | null> {
    const iap = loadIapModule();
    await this.ensureConnected();
    const purchases = await iap.getAvailablePurchases();
    const latest = purchases[0];
    if (!latest) {
      return null;
    }

    return {
      token: purchaseToken(latest),
      platform: platformForStore(),
      productId: latest.productId,
    };
  }

  async dispose(): Promise<void> {
    const iap = loadIapModule();
    this.purchaseSub?.remove();
    this.errorSub?.remove();
    if (this.connected) {
      await iap.endConnection();
      this.connected = false;
    }
  }
}
