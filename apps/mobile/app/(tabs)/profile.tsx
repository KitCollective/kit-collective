import { StyleSheet, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { ScreenHeader } from "@/components/screen-header";
import { useTabBarContentPadding } from "@/components/shortcut-chip-row";
import { Button, EmptyState } from "@/components/ui";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export default function ProfileScreen() {
  const theme = useTheme();
  const tabBarPadding = useTabBarContentPadding();
  const { signOut } = useAuth();

  return (
    <View
      style={[styles.container, { backgroundColor: theme.canvas, paddingBottom: tabBarPadding }]}
    >
      <ScreenHeader title="Profil" />
      <EmptyState
        title="Din profil"
        body="Indstillinger kommer snart."
        action={<Button label="Log ud" variant="tertiary" onPress={() => void signOut()} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: space.insetMd,
  },
});
