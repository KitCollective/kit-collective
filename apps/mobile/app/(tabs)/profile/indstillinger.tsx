import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DrillHeader, ListNavigateRow, ProfileSurfaceGroup } from "@/components/profile-ui";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export default function IndstillingerScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.container, { backgroundColor: theme.fillSecondary }]}>
      <View style={{ paddingTop: insets.top }}>
        <DrillHeader title="Indstillinger" onBack={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <ProfileSurfaceGroup>
          <ListNavigateRow
            title="Profiloplysninger"
            icon="person-outline"
            onPress={() => router.push("/(tabs)/profile/edit")}
          />
        </ProfileSurfaceGroup>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: space.insetMd,
  },
  content: {
    gap: space.gapLg,
    paddingBottom: space.insetLg,
  },
});
