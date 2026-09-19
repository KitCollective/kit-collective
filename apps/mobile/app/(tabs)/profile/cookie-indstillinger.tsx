import type { CookieConsent } from "@kit/api-contract";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  acceptAllCookieConsent,
  essentialOnlyCookieConsent,
  fetchCookieConsent,
  updateCookieConsent,
} from "@/api/identity";
import { useAuth } from "@/auth/AuthProvider";
import {
  DrillHeader,
  ListMetaRow,
  ListSwitchRow,
  ProfileRowDivider,
  ProfileSurfaceGroup,
} from "@/components/profile-ui";
import { Button, ButtonDock } from "@/components/ui";
import { loadAnalysisIfConsented } from "@/consent/analysis-loader";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export default function CookieSettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();
  const [consent, setConsent] = useState<CookieConsent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const applyConsent = useCallback(
    async (next: CookieConsent) => {
      if (!accessToken) {
        return;
      }

      setSaving(true);
      try {
        const saved = await updateCookieConsent(accessToken, next);
        setConsent(saved);
        loadAnalysisIfConsented(saved);
      } finally {
        setSaving(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    let active = true;

    async function load() {
      if (!accessToken) {
        setLoading(false);
        return;
      }

      try {
        const current = await fetchCookieConsent(accessToken);
        if (active) {
          setConsent(current);
          loadAnalysisIfConsented(current);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [accessToken]);

  return (
    <View style={[styles.container, { backgroundColor: theme.fillSecondary }]}>
      <View style={{ paddingTop: insets.top }}>
        <DrillHeader title="Cookie-indstillinger" onBack={() => router.back()} />
      </View>
      {loading || !consent ? (
        <ActivityIndicator style={styles.loader} color={theme.fillPrimary} />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <ProfileSurfaceGroup>
              <ListMetaRow title="Nødvendige" meta="Altid aktive" />
              <ProfileRowDivider />
              <ListSwitchRow
                title="Analyse"
                helper="Hjælper os med at forbedre appen."
                value={consent.analysis}
                disabled={saving}
                onValueChange={(value) => void applyConsent({ ...consent, analysis: value })}
              />
              <ProfileRowDivider />
              <ListSwitchRow
                title="Marketing"
                helper="Relevante tilbud og nyheder."
                value={consent.marketing}
                disabled={saving}
                onValueChange={(value) => void applyConsent({ ...consent, marketing: value })}
              />
            </ProfileSurfaceGroup>
          </ScrollView>
          <ButtonDock>
            <Button
              label="Acceptér alle"
              variant="primary"
              width="fill"
              loading={saving}
              onPress={() => void applyConsent(acceptAllCookieConsent())}
            />
            <Button
              label="Kun nødvendige"
              variant="secondary"
              width="fill"
              loading={saving}
              onPress={() => void applyConsent(essentialOnlyCookieConsent())}
            />
            <Button
              label="Bekræft mine valg"
              variant="tertiary"
              width="fill"
              loading={saving}
              onPress={() => router.back()}
            />
          </ButtonDock>
        </>
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
