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

export default function PushNotifikationerScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { prefs, loading, patchPrefs } = useIdentityPrefs();

  const masterOff = prefs ? !prefs.pushEnabled : true;

  const toggle = (field: "pushHighPriority" | "pushOther" | "pushEnabled", value: boolean) => {
    if (!accessToken || !prefs) {
      return;
    }
    void patchPrefs({ [field]: value });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.fillSecondary }]}>
      <View style={{ paddingTop: insets.top }}>
        <DrillHeader title="Push-notifikationer" onBack={() => router.back()} />
      </View>
      {loading || !prefs ? (
        <ActivityIndicator style={styles.loader} color={theme.fillPrimary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.section, masterOff && styles.dimmed]}>
            <ProfileSurfaceGroup>
              <ListSwitchRow
                title="Høj prioritet"
                helper="Bud, beskeder og vigtige hændelser."
                value={prefs.pushHighPriority}
                disabled={masterOff}
                onValueChange={(value) => toggle("pushHighPriority", value)}
              />
              <ProfileRowDivider />
              <ListSwitchRow
                title="Andre notifikationer"
                helper="Nyheder og mindre vigtige opdateringer."
                value={prefs.pushOther}
                disabled={masterOff}
                onValueChange={(value) => toggle("pushOther", value)}
              />
            </ProfileSurfaceGroup>
          </View>

          <View style={styles.section}>
            <ProfileSurfaceGroup>
              <ListSwitchRow
                title="Slå push til"
                value={prefs.pushEnabled}
                onValueChange={(value) => toggle("pushEnabled", value)}
              />
            </ProfileSurfaceGroup>
          </View>
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
    gap: space.gapLg,
    paddingBottom: space.insetLg,
  },
  section: {
    gap: space.gapSm,
  },
  dimmed: {
    opacity: 0.4,
  },
  loader: {
    marginTop: space.insetLg,
  },
});
