import type { Entitlement } from "@kit/api-contract";

export type PremiumAccessIntent = "live" | "trial_eligible" | "paywall";

/** Metro inlines `__DEV__`. Vitest has no RN global, so missing counts as a local Desktop build. */
function defaultIsDevBuild(): boolean {
  return typeof __DEV__ === "undefined" ? true : __DEV__;
}

export function entitlementGateIsOff(
  flag = process.env.EXPO_PUBLIC_ENTITLEMENT_GATE,
  isDevBuild = defaultIsDevBuild(),
): boolean {
  if (!isDevBuild) {
    return false;
  }
  return flag?.trim() === "off";
}

export function resolvePremiumAccessIntent(
  entitlement: Entitlement,
  gateFlag = process.env.EXPO_PUBLIC_ENTITLEMENT_GATE,
  isDevBuild = defaultIsDevBuild(),
): PremiumAccessIntent {
  if (entitlementGateIsOff(gateFlag, isDevBuild) || entitlement.live) {
    return "live";
  }

  if (!entitlement.trialUsed) {
    return "trial_eligible";
  }

  return "paywall";
}
