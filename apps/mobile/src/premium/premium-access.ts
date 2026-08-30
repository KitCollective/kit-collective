import type { Entitlement } from "@kit/api-contract";

export type PremiumAccessIntent = "live" | "trial_eligible" | "paywall";

export function resolvePremiumAccessIntent(entitlement: Entitlement): PremiumAccessIntent {
  if (entitlement.live) {
    return "live";
  }

  if (!entitlement.trialUsed) {
    return "trial_eligible";
  }

  return "paywall";
}
