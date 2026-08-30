import { popularCitiesForCountryLabel } from "@kit/domain";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { searchCatalogCountries } from "@/api/catalog";
import { fetchCurrentUser, updateProfile } from "@/api/identity";
import { useAuth } from "@/auth/AuthProvider";
import { SearchField } from "@/components/catalog-ui";
import {
  DrillHeader,
  ListSelectRow,
  ListValueRow,
  ProfileRowDivider,
  ProfileSurfaceGroup,
} from "@/components/profile-ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export default function LocationScreen() {
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken, refreshUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [countryId, setCountryId] = useState<string | null>(null);
  const [countryLabel, setCountryLabel] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [cityQuery, setCityQuery] = useState("");
  const [countries, setCountries] = useState<Array<{ id: string; label: string }>>([]);

  const loadScreen = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const [profile, countryResults] = await Promise.all([
      fetchCurrentUser(accessToken),
      searchCatalogCountries(accessToken, ""),
    ]);

    setCountryId(profile.countryId);
    setCountryLabel(profile.countryLabel);
    setCity(profile.city);
    setCountries(countryResults.items);
  }, [accessToken]);

  useEffect(() => {
    let active = true;

    async function run() {
      try {
        await loadScreen();
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, [loadScreen]);

  const popularCities = useMemo(() => popularCitiesForCountryLabel(countryLabel), [countryLabel]);

  const filteredPopularCities = useMemo(() => {
    const query = cityQuery.trim().toLowerCase();
    if (!query) {
      return popularCities;
    }
    return popularCities.filter((entry) => entry.toLowerCase().includes(query));
  }, [cityQuery, popularCities]);

  const showFreeTagRow = useMemo(() => {
    const query = cityQuery.trim();
    if (!query || !countryId) {
      return false;
    }
    return !popularCities.some((entry) => entry.toLowerCase() === query.toLowerCase());
  }, [cityQuery, countryId, popularCities]);

  async function saveLocation(patch: { countryId?: string | null; city?: string | null }) {
    if (!accessToken) {
      return;
    }

    setSaving(true);
    try {
      const updated = await updateProfile(accessToken, patch);
      setCountryId(updated.countryId);
      setCountryLabel(updated.countryLabel);
      setCity(updated.city);
      await refreshUser();
    } finally {
      setSaving(false);
    }
  }

  async function selectCountry(id: string, label: string) {
    if (id === countryId) {
      return;
    }

    setCountryId(id);
    setCountryLabel(label);
    setCity(null);
    setCityQuery("");
    await saveLocation({ countryId: id, city: null });
  }

  async function selectCity(nextCity: string) {
    setCity(nextCity);
    setCityQuery(nextCity);
    await saveLocation({ city: nextCity });
    router.back();
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.fillSecondary }]}>
        <ActivityIndicator color={theme.contentPrimary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.fillSecondary }]}>
      <View style={{ paddingTop: insets.top }}>
        <DrillHeader title="Min lokation" onBack={() => router.back()} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <ProfileSurfaceGroup>
          {countries.map((entry, index) => (
            <View key={entry.id}>
              {index > 0 ? <ProfileRowDivider /> : null}
              <ListValueRow
                title={entry.label}
                meta={entry.id === countryId ? "Nuværende" : undefined}
                onPress={() => void selectCountry(entry.id, entry.label)}
                chevron
              />
            </View>
          ))}
        </ProfileSurfaceGroup>

        {countryId ? (
          <>
            <SearchField
              variant="city"
              accessibilityLabel="Søg efter by"
              placeholder="Søg efter by"
              value={cityQuery}
              onChangeText={setCityQuery}
              onClear={() => setCityQuery("")}
            />

            <Text style={[typography.labelSm, { color: theme.contentSecondary }]}>
              Populære byer · {countryLabel ?? ""}
            </Text>

            <ProfileSurfaceGroup>
              {filteredPopularCities.map((entry, index) => (
                <View key={entry}>
                  {index > 0 ? <ProfileRowDivider /> : null}
                  <ListSelectRow
                    title={entry}
                    selected={city === entry}
                    onPress={() => void selectCity(entry)}
                  />
                </View>
              ))}

              {showFreeTagRow ? (
                <>
                  {filteredPopularCities.length > 0 ? <ProfileRowDivider /> : null}
                  <ListValueRow
                    title={`Brug «${cityQuery.trim()}»`}
                    helper="Gemmes som et frit tag — ikke en fejl."
                    onPress={() => void selectCity(cityQuery.trim())}
                    chevron
                  />
                </>
              ) : null}
            </ProfileSurfaceGroup>
          </>
        ) : null}

        {saving ? <ActivityIndicator color={theme.contentPrimary} style={styles.saving} /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: space.insetMd,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    gap: space.gapLg,
    paddingBottom: space.insetLg,
  },
  saving: {
    marginTop: space.insetSm,
  },
});
