import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createStoreBillingClient,
  getWebIapUnavailableMessage,
  setPlatformOsForTests,
  setStoreBillingClientForTests,
} from "../src/premium/store-billing-client";

const clientPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/premium/store-billing-client.ts",
);

const nativeClientPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/premium/native-store-billing.ts",
);

describe("store-billing-client source guards", () => {
  it("documents SAFETY on native module require", () => {
    const source = readFileSync(clientPath, "utf8");
    expect(source).toMatch(/SAFETY:.*Platform\.OS is ios\/android/s);
    expect(source).toContain('require("./native-store-billing")');
  });

  it("guards web before native require", () => {
    const source = readFileSync(clientPath, "utf8");
    expect(source).toContain('=== "web"');
    const webGuardIndex = source.indexOf('=== "web"');
    const nativeRequireIndex = source.indexOf('require("./native-store-billing")');
    expect(webGuardIndex).toBeGreaterThan(-1);
    expect(nativeRequireIndex).toBeGreaterThan(webGuardIndex);
  });

  it("documents SAFETY on react-native-iap require in native client", () => {
    const source = readFileSync(nativeClientPath, "utf8");
    expect(source).toMatch(
      /SAFETY:.*createStoreBillingClient only loads this module on iOS\/Android/s,
    );
    expect(source).toContain('require("react-native-iap")');
  });
});

describe("createStoreBillingClient web guard", () => {
  beforeEach(() => {
    setPlatformOsForTests("web");
    setStoreBillingClientForTests(null);
  });

  afterEach(() => {
    setPlatformOsForTests(null);
    setStoreBillingClientForTests(null);
  });

  it("returns unavailable client on web without loading native IAP", async () => {
    const client = createStoreBillingClient();
    expect(client.iapAvailable).toBe(false);
    await expect(client.purchaseProduct("sku")).rejects.toThrow(getWebIapUnavailableMessage());
    await expect(client.restorePurchases()).rejects.toThrow(getWebIapUnavailableMessage());
    expect(await client.fetchProductPrices([])).toEqual([]);
  });
});
