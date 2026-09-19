import { formatProfileLocationMeta } from "@kit/domain";
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
import { fetchCurrentUser, resolveAvatarUrl, updateProfile, uploadAvatar } from "@/api/identity";
import { useAuth } from "@/auth/AuthProvider";
import { Avatar } from "@/components/avatar";
import { ListNavigateRow, ProfileSurfaceGroup, TextField } from "@/components/profile-ui";
import { Button, ButtonDock } from "@/components/ui";
import {
  PROFILE_ABOUT_LABEL,
  PROFILE_CHOOSE_PHOTO,
  PROFILE_CONTINUE,
  PROFILE_LOCATION_LABEL,
  PROFILE_TITLE,
  profileHandleCaption,
} from "@/first-session/profile-copy";
import { ProfileLocation } from "@/first-session/profile-location";
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
  const [locationOpen, setLocationOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [aboutMe, setAboutMe] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [countryLabel, setCountryLabel] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const locationMeta = useMemo(
    () => formatProfileLocationMeta(city, countryLabel),
    [city, countryLabel],
  );

  const avatarHeaders = useMemo(
    () => (accessToken && avatarUrl ? { Authorization: `Bearer ${accessToken}` } : undefined),
    [accessToken, avatarUrl],
  );

  const loadProfile = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const profile = await fetchCurrentUser(accessToken);
    setHandle(profile.handle);
    setAboutMe(profile.aboutMe ?? "");
    setAvatarUrl(profile.avatarUrl);
    setCountryLabel(profile.countryLabel);
    setCity(profile.city);
  }, [accessToken]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    async function run() {
      try {
        await loadProfile();
      } catch {
        if (active) {
          setError("Kunne ikke hente profil");
        }
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

  async function handlePickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted || !accessToken) {
      return;
    }

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
  }

  async function handleContinue() {
    if (saving) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (accessToken && aboutMe.trim().length > 0) {
        await updateProfile(accessToken, { aboutMe: aboutMe.trim() });
        await refreshUser();
      }
      onContinue();
    } catch {
      setError("Kunne ikke gemme profil");
    } finally {
      setSaving(false);
    }
  }

  if (locationOpen) {
    return (
      <ProfileLocation
        onBack={() => setLocationOpen(false)}
        onSaved={(location) => {
          setCountryLabel(location.countryLabel);
          setCity(location.city);
        }}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.canvas }]}>
      <View style={[styles.header, { paddingTop: insets.top + space.insetLg }]}>
        <Text style={[typography.title, { color: theme.contentPrimary }]}>{PROFILE_TITLE}</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.contentPrimary} />
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.identity}>
              <Avatar
                handle={handle}
                uri={resolveAvatarUrl(avatarUrl)}
                uriHeaders={avatarHeaders}
                size="lg"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={PROFILE_CHOOSE_PHOTO}
                onPress={() => void handlePickPhoto()}
                style={({ pressed }) => [styles.choosePhoto, pressed && styles.pressed]}
              >
                <Text style={[typography.label, { color: theme.contentPrimary }]}>
                  {PROFILE_CHOOSE_PHOTO}
                </Text>
              </Pressable>
              {handle ? (
                <Text style={[typography.mono, { color: theme.contentSecondary }]}>
                  {profileHandleCaption(handle)}
                </Text>
              ) : null}
            </View>

            <ProfileSurfaceGroup>
              <ListNavigateRow
                title={PROFILE_LOCATION_LABEL}
                meta={locationMeta ?? undefined}
                icon="location-outline"
                onPress={() => setLocationOpen(true)}
              />
            </ProfileSurfaceGroup>

            <TextField
              label={PROFILE_ABOUT_LABEL}
              value={aboutMe}
              onChangeText={setAboutMe}
              multiline
              autoCapitalize="sentences"
            />

            {error ? (
              <Text style={[typography.caption, { color: theme.danger }]}>{error}</Text>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <ButtonDock>
        <Button
          label={PROFILE_CONTINUE}
          variant="primary"
          width="fill"
          loading={saving}
          onPress={() => void handleContinue()}
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
  header: {
    paddingHorizontal: space.insetLg,
    paddingBottom: space.insetMd,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    gap: space.gapLg,
    paddingHorizontal: space.insetMd,
    paddingBottom: space.insetLg,
  },
  identity: {
    alignItems: "center",
    gap: space.gapMd,
  },
  choosePhoto: {
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.insetSm,
  },
  pressed: {
    opacity: 0.9,
  },
});
