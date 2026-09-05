import { useSafeAreaInsets } from "react-native-safe-area-context";
import { coalesceSafeAreaInsets, type SafeAreaEdges } from "./stable-safe-area";

let remembered: SafeAreaEdges | null = null;

export function resetRememberedSafeAreaInsetsForTests(): void {
  remembered = null;
}

export function useStableSafeAreaInsets(): SafeAreaEdges {
  const live = useSafeAreaInsets();
  remembered = coalesceSafeAreaInsets(live, remembered);
  return remembered;
}
