import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/screen-header";
import { EmptyState } from "@/components/ui";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export default function WishlistScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // Reserve space for floating tab bar — inline per docs/design-system.md Layout constraints.
  const tabBarPadding =
    space.insetLg * 2 +
    space.insetMd +
    space.insetLg +
    space.insetSm +
    insets.bottom +
    space.insetMd;

  return (
    <View
      style={[styles.container, { backgroundColor: theme.canvas, paddingBottom: tabBarPadding }]}
    >
      <ScreenHeader title="Ønske" />
      <EmptyState title="Ingen ønsker endnu" body="Ønskelisten kommer snart." />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
