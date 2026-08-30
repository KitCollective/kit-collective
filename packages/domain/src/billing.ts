/** Entitlement source as stored and returned by Nest — not on User.role. */
export const ENTITLEMENT_SOURCES = ["iap_apple", "iap_google", "trial", "comp"] as const;

export type EntitlementSource = (typeof ENTITLEMENT_SOURCES)[number];
