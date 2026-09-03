import { formatProfileLocationMeta, popularCitiesForCountryLabel } from "@kit/domain";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { searchCatalogCountries } from "@/api/catalog";
import { fetchCurrentUser, resolveAvatarUrl, updateProfile, uploadAvatar } from "@/api/identity";
import { useAuth } from "@/auth/AuthProvider";
import { Avatar } from "@/components/avatar";
import { SearchField } from "@/components/catalog-ui";
import {
  DrillHeader,
  ListNavigateRow,
  ListSelectRow,
  ListValueRow,
  ProfileRowDivider,
  ProfileSurfaceGroup,
  TextField,
} from "@/components/profile-ui";
import { Button, ButtonDock } from "@/components/ui";
import {
  PROFILE_ABOUT_LABEL,
  PROFILE_CHOOSE_PHOTO,
  PROFILE_CITY_SEARCH,
  PROFILE_CONTINUE,
  PROFILE_FREE_TAG_HELPER,
  PROFILE_LOCATION_LABEL,
  PROFILE_POPULAR_CITIES,
  PROFILE_TITLE,
} from "@/first-session/profile-copy";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type ProfileOnboardingScreenProps = {
  onContinue: () => void;
};

export function ProfileOnboardingScreen({ onContinue }: ProfileOnboardingScreenProps) {
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const { accessToken, refreshUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [aboutMe, setAboutMe] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [countryId, setCountryId] = useState<string | null>(null);
  const [countryLabel, setCountryLabel] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [cityQuery, setCityQuery] = useState("");
  const [countries, setCountries] = useState<Array<{ id: string; label: string }>>([]);

  const locationMeta = useMemo(
    () => formatProfileLocationMeta(city, countryLabel),
    [city, countryLabel],
  );

  const avatarHeaders = useMemo(
    () => (accessToken && avatarUrl ? { Authorization: `Bearer ${accessToken}` } : undefined),
    [accessToken, avatarUrl],
  );

  const handleCaption = handle ? `@${handle}` : "";

  const loadProfile = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const [profile, countryResults] = await Promise.all([
      fetchCurrentUser(accessToken),
      searchCatalogCountries(accessToken, ""),
    ]);

    setHandle(profile.handle);
    setAboutMe(profile.aboutMe ?? "");
    setAvatarUrl(profile.avatarUrl);
    setCountryId(profile.countryId);
    setCountryLabel(profile.countryLabel);
    setCity(profile.city);
    setCountries(countryResults.items);
  }, [accessToken]);

  useEffect(() => {
    let active = true;

    async function run() {
      try {
        await loadProfile();
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
  }, [loadProfile]);

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
    setLocationOpen(false);
  }

  async function handlePickPhoto() {
    if (!accessToken || pickingPhoto) {
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return;
    }

    setPickingPhoto(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.9,
        base64: true,
      });

      if (result.canceled || !result.assets[0]?.base64) {
        return;
      }

      const updated = await uploadAvatar(accessToken, result.assets[0].base64);
      setAvatarUrl(updated.avatarUrl);
      await refreshUser();
    } finally {
      setPickingPhoto(false);
    }
  }

  async function handleContinue() {
    if (saving) {
      return;
    }

    setSaving(true);
    try {
      if (accessToken) {
        try {
          await updateProfile(accessToken, { aboutMe });
          await refreshUser();
        } catch {
          // Fortsæt must stay available even when optional profile writes fail.
        }
      }
      onContinue();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.canvas }]}>
        <ActivityIndicator color={theme.contentPrimary} />
      </View>
    );
  }

  if (locationOpen) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.canvas }]}>
        <View style={{ paddingTop: insets.top }}>
          <DrillHeader title={PROFILE_LOCATION_LABEL} onBack={() => setLocationOpen(false)} />
        </View>
        <ScrollView contentContainerStyle={styles.locationContent}>
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
                accessibilityLabel={PROFILE_CITY_SEARCH}
                placeholder={PROFILE_CITY_SEARCH}
                value={cityQuery}
                onChangeText={setCityQuery}
                onClear={() => setCityQuery("")}
              />

              <Text style={[typography.labelSm, { color: theme.contentSecondary }]}>
                {PROFILE_POPULAR_CITIES} · {countryLabel ?? ""}
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
                      helper={PROFILE_FREE_TAG_HELPER}
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

  return (
    <View style={[styles.screen, { backgroundColor: theme.canvas }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + space.insetLg }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text
            accessibilityRole="header"
            style={[typography.title, { color: theme.contentPrimary }]}
          >
            {PROFILE_TITLE}
          </Text>

          <View style={styles.avatarBlock}>
            <Avatar
              handle={handle}
              uri={resolveAvatarUrl(avatarUrl)}
              uriHeaders={avatarHeaders}
              size="lg"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={PROFILE_CHOOSE_PHOTO}
              disabled={pickingPhoto}
              onPress={() => void handlePickPhoto()}
              style={({ pressed }) => [
                styles.choosePhoto,
                pressed && !pickingPhoto && styles.pressed,
              ]}
            >
              {pickingPhoto ? (
                <ActivityIndicator color={theme.contentPrimary} />
              ) : (
                <Text style={[typography.label, { color: theme.contentPrimary }]}>
                  {PROFILE_CHOOSE_PHOTO}
                </Text>
              )}
            </Pressable>
            {handleCaption ? (
              <Text style={[typography.mono, { color: theme.contentSecondary }]}>
                {handleCaption}
              </Text>
            ) : null}
          </View>

          <ListNavigateRow
            title={PROFILE_LOCATION_LABEL}
            meta={locationMeta ?? undefined}
            icon="location-outline"
            onPress={() => setLocationOpen(true)}
          />

          <TextField
            label={PROFILE_ABOUT_LABEL}
            value={aboutMe}
            onChangeText={setAboutMe}
            multiline
            autoCapitalize="sentences"
          />
        </ScrollView>
      </KeyboardAvoidingView>
      <ButtonDock>
        <Button
          label={PROFILE_CONTINUE}
          variant="primary"
          width="fill"
          loading={saving}
          onPress={() => {
            void handleContinue();
          }}
        />
      </ButtonDock>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: space.insetLg,
    gap: space.gapLg,
    paddingBottom: space.insetLg,
  },
  locationContent: {
    paddingHorizontal: space.insetMd,
    gap: space.gapLg,
    paddingBottom: space.insetLg,
  },
  avatarBlock: {
    alignItems: "center",
    gap: space.gapMd,
  },
  choosePhoto: {
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.insetMd,
  },
  pressed: {
    opacity: 0.9,
  },
  saving: {
    marginTop: space.insetSm,
  },
});
