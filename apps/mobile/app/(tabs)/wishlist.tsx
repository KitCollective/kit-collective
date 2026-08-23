import { StyleSheet, View } from "react-native";
import { ScreenHeader } from "@/components/screen-header";
import { useTabBarContentPadding } from "@/components/shortcut-chip-row";
import { EmptyState } from "@/components/ui";
import { useTheme } from "@/theme/use-theme";
import { space } from "@/theme/tokens";

export default function WishlistScreen() {
  const theme = useTheme();
  const tabBarPadding = useTabBarContentPadding();

  return (
    <View style={[styles.container, { backgroundColor: theme.canvas, paddingBottom: tabBarPadding }]}>
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
