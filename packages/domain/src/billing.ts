/** Entitlement source as stored and returned by Nest — not on User.role. */
export const ENTITLEMENT_SOURCES = ["iap_apple", "iap_google", "trial", "comp"] as const;

export type EntitlementSource = (typeof ENTITLEMENT_SOURCES)[number];

export const IAP_PLATFORMS = ["apple", "google"] as const;

export type IapPlatform = (typeof IAP_PLATFORMS)[number];

/** Store product ids seeded in `offer` — prices come from the store SDK, not Admin DKK. */
export const OFFER_PRODUCT_IDS = {
  month: "com.kitcollective.premium.month",
  year: "com.kitcollective.premium.year",
} as const;

export function entitlementSourceForIapPlatform(platform: IapPlatform): "iap_apple" | "iap_google" {
  switch (platform) {
    case "apple":
      return "iap_apple";
    case "google":
      return "iap_google";
    default: {
      const exhaustive: never = platform;
      return exhaustive;
    }
  }
}
