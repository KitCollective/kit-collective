import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CatalogDrillScreen } from "@/components/catalog-drill-screen";
import { tabBarContentInset } from "@/components/tab-bar-metrics";

export default function SearchKitDrillScreen() {
  const insets = useSafeAreaInsets();
  const tabBarPadding = tabBarContentInset(insets.bottom);

  return <CatalogDrillScreen kind="kit" contentPaddingBottom={tabBarPadding} />;
}
