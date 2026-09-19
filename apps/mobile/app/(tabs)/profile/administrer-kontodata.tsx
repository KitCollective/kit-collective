import type { IdentityExport } from "@kit/api-contract";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchAccountExport } from "@/api/identity";
import { useAuth } from "@/auth/AuthProvider";
import { DrillHeader } from "@/components/profile-ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export default function AdministrerKontodataScreen() {
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();
  const [exportData, setExportData] = useState<IdentityExport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!accessToken) {
        setLoading(false);
        return;
      }

      try {
        const payload = await fetchAccountExport(accessToken);
        if (active) {
          setExportData(payload);
        }
      } catch {
        if (active) {
          setError("Kunne ikke hente dine kontodata.");
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
        <DrillHeader title="Administrer kontodata" onBack={() => router.back()} />
      </View>
      {loading ? (
        <ActivityIndicator style={styles.loader} color={theme.fillPrimary} />
      ) : error ? (
        <Text style={[typography.body, styles.message, { color: theme.danger }]}>{error}</Text>
      ) : exportData ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[typography.body, { color: theme.contentPrimary }]}>
            Her er en kopi af dine profiloplysninger og trøje-id’er.
          </Text>
          <Text style={[typography.mono, { color: theme.contentSecondary }]}>
            {exportData.handle} · {exportData.email}
          </Text>
          <Text style={[typography.caption, { color: theme.contentSecondary }]}>
            {exportData.userJerseyIds.length} trøjer i din samling
          </Text>
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: space.insetMd,
  },
  content: {
    gap: space.gapMd,
    paddingBottom: space.insetLg,
  },
  loader: {
    marginTop: space.insetLg,
  },
  message: {
    marginTop: space.insetLg,
  },
});
