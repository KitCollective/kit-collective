import type { AuthEventKind, AuthEvents } from "@kit/api-contract";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchAuthEvents, fetchPrefs, logoutSession, revokeAllSessions } from "@/api/identity";
import { useAuth } from "@/auth/AuthProvider";
import { ConfirmSheet, SettingsSectionLabel } from "@/components/account-ui";
import {
  DrillHeader,
  ListDangerRow,
  ListMetaRow,
  ListNavigateRow,
  ProfileRowDivider,
  ProfileSurfaceGroup,
} from "@/components/profile-ui";
import { appearanceLabel, localeLabel } from "@/prefs/labels";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

function authEventKindLabel(kind: AuthEventKind): string {
  switch (kind) {
    case "login":
      return "Log ind";
    case "logout":
      return "Log ud";
    case "failure":
      return "Mislykket login";
    case "reset":
      return "Adgangskode nulstillet";
    case "provider_link":
      return "Konto knyttet";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

function formatEventWhen(iso: string): string {
  return new Date(iso).toLocaleString("da-DK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken, signOut } = useAuth();
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [revokeVisible, setRevokeVisible] = useState(false);
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [localeMeta, setLocaleMeta] = useState("Dansk");
  const [appearanceMeta, setAppearanceMeta] = useState("Systemindstilling");
  const [authEvents, setAuthEvents] = useState<AuthEvents | null>(null);

  useEffect(() => {
    let active = true;

    async function loadMeta() {
      if (!accessToken) {
        return;
      }

      try {
        const [prefs, events] = await Promise.all([
          fetchPrefs(accessToken),
          fetchAuthEvents(accessToken),
        ]);
        if (active) {
          setLocaleMeta(localeLabel(prefs.locale));
          setAppearanceMeta(appearanceLabel(prefs.appearance));
          setAuthEvents(events);
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

  const confirmRevokeAll = async () => {
    if (!accessToken) {
      await signOut();
      return;
    }

    setRevokeLoading(true);
    try {
      await revokeAllSessions(accessToken);
    } finally {
      await signOut();
      setRevokeLoading(false);
      setRevokeVisible(false);
    }
  };

  const eventRows = authEvents?.events ?? [];

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
          <SettingsSectionLabel>Login-historik</SettingsSectionLabel>
          <ProfileSurfaceGroup>
            {eventRows.length === 0 ? (
              <ListMetaRow title="Ingen hændelser" meta="—" />
            ) : (
              eventRows.map((event, index) => (
                <View key={event.id}>
                  {index > 0 ? <ProfileRowDivider /> : null}
                  <ListMetaRow
                    title={authEventKindLabel(event.kind)}
                    meta={formatEventWhen(event.createdAt)}
                  />
                </View>
              ))
            )}
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
            <ProfileRowDivider />
            <ListDangerRow
              title="Log ud overalt"
              icon="log-out-outline"
              onPress={() => setRevokeVisible(true)}
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
      <ConfirmSheet
        visible={revokeVisible}
        title="Log ud overalt?"
        consequence="Du logges ud på alle enheder. Din samling og dine favoritter bliver gemt."
        confirmLabel="Log ud overalt"
        loading={revokeLoading}
        onConfirm={() => void confirmRevokeAll()}
        onDismiss={() => setRevokeVisible(false)}
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
