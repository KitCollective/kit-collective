import { tabBarContentInset } from "@/components/tab-bar-metrics";
import { space } from "@/theme/tokens";

/**
 * Bottom padding of the Send bud dock (docs/design-system.md → Send bid).
 * Closed number pad: clear the native tab bar and home indicator.
 * Open number pad: the keyboard already covers both, so sit just above it.
 */
export function sendBidDockBottomPadding(keyboardVisible: boolean, safeAreaBottom: number): number {
  return keyboardVisible ? space.insetSm : tabBarContentInset(safeAreaBottom);
}

/** Button label: carries the whole-kroner amount, or plain "Send bud" without one. */
export function sendBidButtonLabel(amountText: string): string {
  const amount = Number.parseInt(amountText, 10);
  return Number.isInteger(amount) && amount >= 1 ? `Send bud på ${amount} kr` : "Send bud";
}
