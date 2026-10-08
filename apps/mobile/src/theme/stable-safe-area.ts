export type SafeAreaEdges = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

/**
 * Nested NativeTabs SafeAreaProviders report device-only insets until the tab
 * is attached (home indicator ~34), then bounded insets (device + tab bar ~83).
 * Expo issue 42486: the larger bottom is always the correct one. Pinning the
 * window/device value fights that measurement and still lets padding jump when
 * `tabBarContentInset` adds the bar height on top of a bounded 83.
 *
 * NativeTabs isolates React context per tab, so callers keep the remembered
 * edges in a module-level slot and pass them in.
 */
export function rememberLargestInsets(
  live: SafeAreaEdges,
  remembered: SafeAreaEdges | null,
): SafeAreaEdges {
  if (!remembered) {
    return { ...live };
  }
  return {
    top: Math.max(remembered.top, live.top),
    bottom: Math.max(remembered.bottom, live.bottom),
    left: Math.max(remembered.left, live.left),
    right: Math.max(remembered.right, live.right),
  };
}

export function coalesceSafeAreaInsets(
  live: SafeAreaEdges,
  remembered: SafeAreaEdges | null,
): SafeAreaEdges {
  return rememberLargestInsets(live, remembered);
}
