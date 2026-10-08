import type { UserLocale } from "@kit/domain";
import { USER_LOCALES } from "@kit/domain";
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
import { localeLabel } from "@/prefs/labels";
import { useIdentityPrefs } from "@/prefs/use-identity-prefs";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export default function LanguageScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { prefs, loading, patchPrefs } = useIdentityPrefs();

  const selectLocale = (locale: UserLocale) => {
    if (!accessToken || !prefs || prefs.locale === locale) {
      return;
    }
    void patchPrefs({ locale });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.fillSecondary }]}>
      <View style={{ paddingTop: insets.top }}>
        <DrillHeader title="Sprog" onBack={() => router.back()} />
      </View>
      {loading || !prefs ? (
        <ActivityIndicator style={styles.loader} color={theme.fillPrimary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <ProfileSurfaceGroup>
            {USER_LOCALES.map((locale, index) => (
              <View key={locale}>
                {index > 0 ? <ProfileRowDivider /> : null}
                <ListSelectRow
                  title={localeLabel(locale)}
                  selected={prefs.locale === locale}
                  onPress={() => selectLocale(locale)}
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
