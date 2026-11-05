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
