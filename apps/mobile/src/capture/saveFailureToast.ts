import Toast from "react-native-toast-message";

/**
 * Collector-facing save-failure copy (Danish-first per the lock). The retry lives in the
 * toast's own **Prøv igen** action, so the message keeps just the meaning without a
 * redundant trailing sentence.
 */
export const SAVE_JERSEY_FAILURE_MESSAGE = "Kunne ikke gemme trøjen";

/**
 * Fire-and-forget save-failure toast: the `error` type renders the danger chrome
 * (see components/toast-config.tsx) with a **Prøv igen** retry that re-runs Save.
 * Save never waits on the toast (docs/design-system.md → Toast).
 */
export function showSaveFailureToast(onRetry: () => void): void {
  Toast.show({
    type: "error",
    position: "bottom",
    text1: SAVE_JERSEY_FAILURE_MESSAGE,
    props: { onRetry },
  });
}
