import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OFFER_PRODUCT_IDS } from "@kit/domain";
import { describe, expect, it } from "vitest";
import {
  mapProductPricesById,
  PAYWALL_PRODUCT_IDS,
  resolvePaywallPriceLabel,
} from "../src/premium/store-billing";

const paywallPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/components/paywall-sheet.tsx",
);

describe("store billing helpers", () => {
  it("maps localized store prices by Offer product id", () => {
    expect(
      mapProductPricesById([
        { productId: OFFER_PRODUCT_IDS.month, localizedPrice: "29,00 kr." },
        { productId: OFFER_PRODUCT_IDS.year, localizedPrice: "249,00 kr." },
      ]),
    ).toEqual({
      [OFFER_PRODUCT_IDS.month]: "29,00 kr.",
      [OFFER_PRODUCT_IDS.year]: "249,00 kr.",
    });
  });

  it("tracks paywall skus from Offer product ids", () => {
    expect(PAYWALL_PRODUCT_IDS).toEqual([OFFER_PRODUCT_IDS.month, OFFER_PRODUCT_IDS.year]);
  });

  it("keeps button labels when store price is missing", () => {
    expect(resolvePaywallPriceLabel("Månedlig", null)).toBe("Månedlig");
  });
});

describe("PaywallSheet", () => {
  it("uses mono prices, Button dock, and Danish IAP copy", () => {
    const source = readFileSync(paywallPath, "utf8");
    expect(source).toContain("typography.mono");
    expect(source).toContain("ButtonDock");
    expect(source).toContain('label="Månedlig"');
    expect(source).toContain('label="Årlig"');
    expect(source).toContain('label="Gendan køb"');
    expect(source).toContain("webUnavailableMessage");
    expect(source).not.toContain("29 kr");
  });
});
