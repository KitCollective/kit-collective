import type { StoreBillingClient } from "./store-billing.js";

type PlatformOs = "ios" | "android" | "web" | "windows" | "macos";

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
let testPlatformOs: PlatformOs | null = null;

export function setStoreBillingClientForTests(client: StoreBillingClient | null): void {
  testOverride = client;
}

export function setPlatformOsForTests(os: PlatformOs | null): void {
  testPlatformOs = os;
}

function resolvePlatformOs(): PlatformOs {
  if (testPlatformOs !== null) {
    return testPlatformOs;
  }

  // SAFETY: createStoreBillingClient only reads Platform.OS when no test override is active.
  const { Platform } = require("react-native") as typeof import("react-native");
  return Platform.OS;
}

export function getWebIapUnavailableMessage(): string {
  return WEB_UNAVAILABLE_MESSAGE;
}

export function createStoreBillingClient(): StoreBillingClient {
  if (testOverride) {
    return testOverride;
  }

  if (resolvePlatformOs() === "web") {
    return new WebStoreBillingClient();
  }

  return createNativeStoreBillingClient();
}

function createNativeStoreBillingClient(): StoreBillingClient {
  // SAFETY: only called when Platform.OS is ios/android; sibling module exports NativeStoreBillingClient.
  const { NativeStoreBillingClient } =
    require("./native-store-billing") as typeof import("./native-store-billing");
  return new NativeStoreBillingClient();
}
