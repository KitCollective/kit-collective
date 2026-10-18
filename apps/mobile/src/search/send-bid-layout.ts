import { tabBarContentInset } from "@/components/tab-bar-metrics";
import { space } from "@/theme/tokens";

/**
 * Bottom padding of the Send bud dock (docs/design-system.md → Send bid).
 * Open number pad: the keyboard already covers the tab bar and home indicator, so sit just above it.
 * Closed number pad with the Tab bar showing (Android, where the foreign detail is a push inside
 * the Søg stack): clear the native tab bar and home indicator.
 * Closed number pad without a Tab bar (iOS, above the full-screen modal detail): the home
 * indicator only, no Tab bar inset.
 */
export function sendBidDockBottomPadding(
  keyboardVisible: boolean,
  safeAreaBottom: number,
  tabBarShown = true,
): number {
  if (keyboardVisible) {
    return space.insetSm;
  }
  return tabBarShown ? tabBarContentInset(safeAreaBottom) : Math.max(safeAreaBottom, space.insetMd);
}
