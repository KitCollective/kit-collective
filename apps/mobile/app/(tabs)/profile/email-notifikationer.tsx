import { useRouter } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import {
  DrillHeader,
  ListSwitchRow,
  ProfileRowDivider,
  ProfileSurfaceGroup,
} from "@/components/profile-ui";
import { useIdentityPrefs } from "@/prefs/use-identity-prefs";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export default function EmailNotificationsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { prefs, loading, patchPrefs } = useIdentityPrefs();

  const toggle = (field: "emailNews" | "emailHighPriority", value: boolean) => {
    if (!accessToken || !prefs) {
      return;
    }
    void patchPrefs({ [field]: value });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.fillSecondary }]}>
      <View style={{ paddingTop: insets.top }}>
        <DrillHeader title="E-mail-notifikationer" onBack={() => router.back()} />
      </View>
      {loading || !prefs ? (
        <ActivityIndicator style={styles.loader} color={theme.fillPrimary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <ProfileSurfaceGroup>
            <ListSwitchRow
              title="Nyheder"
              helper="Nyheder og tips fra KitCollective."
              value={prefs.emailNews}
              onValueChange={(value) => toggle("emailNews", value)}
            />
            <ProfileRowDivider />
            <ListSwitchRow
              title="Høj prioritet"
              helper="Vigtige beskeder om din samling."
              value={prefs.emailHighPriority}
              onValueChange={(value) => toggle("emailHighPriority", value)}
            />
          </ProfileSurfaceGroup>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: space.insetMd,
  },
  content: {
    paddingBottom: space.insetLg,
  },
  loader: {
    marginTop: space.insetLg,
  },
});
