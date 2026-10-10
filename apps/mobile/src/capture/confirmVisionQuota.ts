import type { VisionMatcherUsage } from "@kit/api-contract";
import { VISION_MATCHER_JERSEY_CAP } from "@kit/domain";

/**
 * Maps GET session Vision Matcher usage onto an out-of-quota flag. Quota is
 * `visionMatcher.remaining` against `VISION_MATCHER_JERSEY_CAP` (10), read from session entitlement.
 * Missing usage stays in-quota so Confirm does not invent a spent state.
 */
export function visionMatcherRemainingToOutOfQuota(
  usage: VisionMatcherUsage | null | undefined,
): boolean {
  if (!usage || usage.unlimited) {
    return false;
  }
  return usage.remaining === 0 && usage.cap === VISION_MATCHER_JERSEY_CAP;
}
