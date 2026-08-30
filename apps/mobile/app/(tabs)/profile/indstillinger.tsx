import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchPrefs, logoutSession } from "@/api/identity";
import { useAuth } from "@/auth/AuthProvider";
import { ConfirmSheet, SettingsSectionLabel } from "@/components/account-ui";
import {
  DrillHeader,
  ListDangerRow,
  ListNavigateRow,
  ProfileRowDivider,
  ProfileSurfaceGroup,
} from "@/components/profile-ui";
import { appearanceLabel, localeLabel } from "@/prefs/labels";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken, signOut } = useAuth();
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [localeMeta, setLocaleMeta] = useState("Dansk");
  const [appearanceMeta, setAppearanceMeta] = useState("Systemindstilling");

  useEffect(() => {
    let active = true;

    async function loadMeta() {
      if (!accessToken) {
        return;
      }

      try {
        const prefs = await fetchPrefs(accessToken);
        if (active) {
          setLocaleMeta(localeLabel(prefs.locale));
          setAppearanceMeta(appearanceLabel(prefs.appearance));
        }
      } catch {
        // Hub keeps default meta when prefs cannot load.
      }
    }

    void loadMeta();

    return () => {
      active = false;
    };
  }, [accessToken]);

  const confirmLogout = async () => {
    if (!accessToken) {
      await signOut();
      return;
    }

    setLogoutLoading(true);
    try {
      await logoutSession(accessToken);
    } finally {
      await signOut();
      setLogoutLoading(false);
      setLogoutVisible(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.fillSecondary }]}>
      <View style={{ paddingTop: insets.top }}>
        <DrillHeader title="Indstillinger" onBack={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <SettingsSectionLabel>Profiloplysninger / Kontoindstillinger</SettingsSectionLabel>
          <ProfileSurfaceGroup>
            <ListNavigateRow
              title="Profiloplysninger"
              icon="person-outline"
              onPress={() => router.push("/(tabs)/profile/edit")}
            />
            <ProfileRowDivider />
            <ListNavigateRow
              title="Kontoindstillinger"
              icon="key-outline"
              onPress={() => router.push("/(tabs)/profile/kontoindstillinger")}
            />
          </ProfileSurfaceGroup>
        </View>

        <View style={styles.section}>
          <SettingsSectionLabel>Push-notifikationer / E-mail-notifikationer</SettingsSectionLabel>
          <ProfileSurfaceGroup>
            <ListNavigateRow
              title="Push-notifikationer"
              icon="notifications-outline"
              onPress={() => router.push("/(tabs)/profile/push-notifikationer")}
            />
            <ProfileRowDivider />
            <ListNavigateRow
              title="E-mail-notifikationer"
              icon="mail-outline"
              onPress={() => router.push("/(tabs)/profile/email-notifikationer")}
            />
          </ProfileSurfaceGroup>
        </View>

        <View style={styles.section}>
          <SettingsSectionLabel>Sprog / Mørk tilstand</SettingsSectionLabel>
          <ProfileSurfaceGroup>
            <ListNavigateRow
              title="Sprog"
              meta={localeMeta}
              icon="language-outline"
              onPress={() => router.push("/(tabs)/profile/sprog")}
            />
            <ProfileRowDivider />
            <ListNavigateRow
              title="Mørk tilstand"
              meta={appearanceMeta}
              icon="moon-outline"
              onPress={() => router.push("/(tabs)/profile/moerk-tilstand")}
            />
          </ProfileSurfaceGroup>
        </View>

        <View style={styles.section}>
          <SettingsSectionLabel>Privatlivsindstillinger</SettingsSectionLabel>
          <ProfileSurfaceGroup>
            <ListNavigateRow
              title="Privatlivsindstillinger"
              icon="lock-closed-outline"
              onPress={() => router.push("/(tabs)/profile/privatlivsindstillinger")}
            />
            <ProfileRowDivider />
            <ListDangerRow
              title="Log ud"
              icon="log-out-outline"
              onPress={() => setLogoutVisible(true)}
            />
          </ProfileSurfaceGroup>
        </View>
      </ScrollView>

      <ConfirmSheet
        visible={logoutVisible}
        title="Log ud af KitCollective?"
        consequence="Din samling og dine favoritter bliver gemt."
        confirmLabel="Log ud"
        loading={logoutLoading}
        onConfirm={() => void confirmLogout()}
        onDismiss={() => setLogoutVisible(false)}
      />
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
});
