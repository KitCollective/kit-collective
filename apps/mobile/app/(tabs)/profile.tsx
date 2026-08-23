import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { ScreenHeader } from "@/components/screen-header";
import { EmptyState, IconButton } from "@/components/ui";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export default function ProfileScreen() {
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
  const { signOut } = useAuth();

  return (
    <View
      style={[styles.container, { backgroundColor: theme.canvas, paddingBottom: tabBarPadding }]}
    >
      <ScreenHeader
        title="Profil"
        trailing={
          <IconButton name="Log ud" icon="log-out-outline" onPress={() => void signOut()} />
        }
      />
      <EmptyState title="Din profil" body="Indstillinger kommer snart." />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: space.insetMd,
  },
});
