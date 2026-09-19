/**
 * Local Desktop kill switch for the Plus Entitlement gate.
 * Production and staging ignore ENTITLEMENT_GATE so a leaked .env cannot open the lane.
 */
export function entitlementGateIsOff(env: NodeJS.ProcessEnv = process.env): boolean {
  const nodeEnv = env.NODE_ENV?.trim();
  if (nodeEnv === "production" || nodeEnv === "staging") {
    return false;
  }
  return env.ENTITLEMENT_GATE?.trim() === "off";
}
