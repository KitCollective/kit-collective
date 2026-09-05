import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CatalogDrillScreen } from "@/components/catalog-drill-screen";
import { tabBarContentInset } from "@/components/tab-bar-metrics";

export default function SearchClubDrillScreen() {
  const insets = useSafeAreaInsets();
  const tabBarPadding = tabBarContentInset(insets.bottom);

  return <CatalogDrillScreen kind="club" contentPaddingBottom={tabBarPadding} />;
}
