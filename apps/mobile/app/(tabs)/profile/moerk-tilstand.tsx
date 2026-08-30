import type { AppearanceMode } from "@kit/domain";
import { APPEARANCE_MODES } from "@kit/domain";
import { useRouter } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import {
  DrillHeader,
  ListSelectRow,
  ProfileRowDivider,
  ProfileSurfaceGroup,
} from "@/components/profile-ui";
import { appearanceLabel } from "@/prefs/labels";
import { useIdentityPrefs } from "@/prefs/use-identity-prefs";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export default function MoerkTilstandScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { prefs, loading, patchPrefs } = useIdentityPrefs();

  const selectAppearance = (appearance: AppearanceMode) => {
    if (!accessToken || !prefs || prefs.appearance === appearance) {
      return;
    }
    void patchPrefs({ appearance });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.fillSecondary }]}>
      <View style={{ paddingTop: insets.top }}>
        <DrillHeader title="Mørk tilstand" onBack={() => router.back()} />
      </View>
      {loading || !prefs ? (
        <ActivityIndicator style={styles.loader} color={theme.fillPrimary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <ProfileSurfaceGroup>
            {APPEARANCE_MODES.map((mode, index) => (
              <View key={mode}>
                {index > 0 ? <ProfileRowDivider /> : null}
                <ListSelectRow
                  title={appearanceLabel(mode)}
                  selected={prefs.appearance === mode}
                  onPress={() => selectAppearance(mode)}
                />
              </View>
            ))}
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
