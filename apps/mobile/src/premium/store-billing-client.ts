import { Platform } from "react-native";
import type { StoreBillingClient } from "./store-billing.js";

const WEB_UNAVAILABLE_MESSAGE = "Køb er kun tilgængelig i iOS- og Android-appen.";

class WebStoreBillingClient implements StoreBillingClient {
  readonly iapAvailable = false;

  async fetchProductPrices(): Promise<never[]> {
    return [];
  }

  async purchaseProduct(): Promise<never> {
    throw new Error(WEB_UNAVAILABLE_MESSAGE);
  }

  async restorePurchases(): Promise<null> {
    throw new Error(WEB_UNAVAILABLE_MESSAGE);
  }
}

let testOverride: StoreBillingClient | null = null;

export function setStoreBillingClientForTests(client: StoreBillingClient | null): void {
  testOverride = client;
}

export function getWebIapUnavailableMessage(): string {
  return WEB_UNAVAILABLE_MESSAGE;
}

export function createStoreBillingClient(): StoreBillingClient {
  if (testOverride) {
    return testOverride;
  }

  if (Platform.OS === "web") {
    return new WebStoreBillingClient();
  }

  return createNativeStoreBillingClient();
}

function createNativeStoreBillingClient(): StoreBillingClient {
  const { NativeStoreBillingClient } =
    require("./native-store-billing") as typeof import("./native-store-billing");
  return new NativeStoreBillingClient();
}
