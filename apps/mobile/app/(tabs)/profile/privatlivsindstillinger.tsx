import { useRouter } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import {
  DrillHeader,
  ListNavigateRow,
  ListSwitchRow,
  ProfileRowDivider,
  ProfileSurfaceGroup,
} from "@/components/profile-ui";
import { useIdentityPrefs } from "@/prefs/use-identity-prefs";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export default function PrivatlivsindstillingerScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { prefs, loading, patchPrefs } = useIdentityPrefs();

  const toggle = (
    field: "privacyPersonalised" | "privacyRecentlySeen" | "privacyFavoriteNotifications",
    value: boolean,
  ) => {
    if (!accessToken || !prefs) {
      return;
    }
    void patchPrefs({ [field]: value });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.fillSecondary }]}>
      <View style={{ paddingTop: insets.top }}>
        <DrillHeader title="Privatlivsindstillinger" onBack={() => router.back()} />
      </View>
      {loading || !prefs ? (
        <ActivityIndicator style={styles.loader} color={theme.fillPrimary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <ProfileSurfaceGroup>
            <ListSwitchRow
              title="Personligt indhold"
              helper="Anbefalinger baseret på din samling."
              value={prefs.privacyPersonalised}
              onValueChange={(value) => toggle("privacyPersonalised", value)}
            />
            <ProfileRowDivider />
            <ListSwitchRow
              title="Senest set"
              helper="Gem hvad du har kigget på for at forbedre forslag."
              value={prefs.privacyRecentlySeen}
              onValueChange={(value) => toggle("privacyRecentlySeen", value)}
            />
            <ProfileRowDivider />
            <ListSwitchRow
              title="Notifikationer om favoritter"
              helper="Få besked når favorittrøjer ændrer sig."
              value={prefs.privacyFavoriteNotifications}
              onValueChange={(value) => toggle("privacyFavoriteNotifications", value)}
            />
            <ProfileRowDivider />
            <ListNavigateRow
              title="Administrer kontodata"
              icon="download-outline"
              onPress={() => router.push("/(tabs)/profile/administrer-kontodata")}
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
