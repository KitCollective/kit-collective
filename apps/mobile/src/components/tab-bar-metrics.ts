import { space } from "@/theme/tokens";

/**
 * Approximate height of the native system tab bar (UITabBar / Material). iOS auto
 * content-insets the first ScrollView, but FlatList integration is limited, so
 * screens still pad their scroll content by this to clear the native bar.
 */
export const NATIVE_TAB_BAR_HEIGHT = 49;

/** Content padding so the last row clears the native tab bar and home indicator. */
export function tabBarContentInset(safeAreaBottom: number): number {
  return NATIVE_TAB_BAR_HEIGHT + safeAreaBottom + space.insetSm;
}
