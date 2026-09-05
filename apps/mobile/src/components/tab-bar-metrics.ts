import { space } from "@/theme/tokens";

/**
 * Approximate height of the native system tab bar (UITabBar / Material). iOS auto
 * content-insets the first ScrollView, but FlatList integration is limited, so
 * screens still pad their scroll content by this to clear the native bar.
 */
export const NATIVE_TAB_BAR_HEIGHT = 49;

/**
 * Tab bar icon point size. Slightly under the iOS 26 SF default; NativeTabs
 * has no SF `pointSize`, so we render template images at this size.
 */
export const TAB_BAR_ICON_SIZE = 22;

/**
 * NativeTabs bounded bottom (~83) already includes this bar. Device-only bottom
 * (~34) does not. Floor is above a home-indicator-only inset and at/under a
 * bounded one (device-only ~34, bounded ~83).
 */
const BOUNDED_BOTTOM_INSET_FLOOR = 50;

/** Content padding so the last row clears the native tab bar and home indicator. */
export function tabBarContentInset(safeAreaBottom: number): number {
  const tabBarAlreadyIncluded = safeAreaBottom >= BOUNDED_BOTTOM_INSET_FLOOR;
  return (tabBarAlreadyIncluded ? 0 : NATIVE_TAB_BAR_HEIGHT) + safeAreaBottom + space.insetSm;
}
