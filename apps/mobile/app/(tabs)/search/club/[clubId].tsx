import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CatalogDrillScreen } from "@/components/catalog-drill-screen";
import { space } from "@/theme/tokens";

export default function SearchClubDrillScreen() {
  const insets = useSafeAreaInsets();
  const tabBarPadding =
    space.insetLg * 2 +
    space.insetMd +
    space.insetLg +
    space.insetSm +
    insets.bottom +
    space.insetMd;

  return <CatalogDrillScreen kind="club" contentPaddingBottom={tabBarPadding} />;
}
