import type { HandleAvailabilityResponse } from "@kit/api-contract";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
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
import {
  fetchCurrentUser,
  fetchHandleAvailability,
  resolveAvatarUrl,
  updateProfile,
  uploadAvatar,
} from "@/api/identity";
import { useAuth } from "@/auth/AuthProvider";
import {
  AvatarChangeRow,
  DrillHeader,
  ProfileSurfaceGroup,
  TextField,
} from "@/components/profile-ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

function handleHelper(
  status: HandleAvailabilityResponse["status"] | null,
  handle: string,
): { text: string; tone: "secondary" | "danger" } | undefined {
  if (!handle) {
    return undefined;
  }

  switch (status) {
    case "yours":
      return {
        text: "Dit brugernavn — unikt og følger dig rundt.",
        tone: "secondary",
      };
    case "available":
      return { text: "Ledigt.", tone: "secondary" };
    case "taken":
      return { text: `${handle} er optaget.`, tone: "danger" };
    default:
      return undefined;
  }
}

export default function EditProfileScreen() {
  const router = useRouter();
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const { accessToken, refreshUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handle, setHandle] = useState("");
  const [aboutMe, setAboutMe] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [initialHandle, setInitialHandle] = useState("");
  const [availability, setAvailability] = useState<HandleAvailabilityResponse["status"] | null>(
    null,
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
    setInitialHandle(profile.handle);
    setAboutMe(profile.aboutMe ?? "");
    setAvatarUrl(profile.avatarUrl);
    setAvailability("yours");
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

  useEffect(() => {
    if (!accessToken || !handle || handle === initialHandle) {
      setAvailability(handle === initialHandle ? "yours" : null);
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      void fetchHandleAvailability(accessToken, handle)
        .then((result) => {
          if (active) {
            setAvailability(result.status);
          }
        })
        .catch(() => {
          if (active) {
            setAvailability(null);
          }
        });
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [accessToken, handle, initialHandle]);

  const helper = handleHelper(availability, handle);
  const saveDisabled = saving || availability === "taken";

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

  async function handleSave() {
    if (!accessToken || saveDisabled) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await updateProfile(accessToken, {
        handle: handle !== initialHandle ? handle : undefined,
        aboutMe,
      });
      await refreshUser();
      router.back();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kunne ikke gemme profil");
    } finally {
      setSaving(false);
    }
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
        <DrillHeader
          title="Rediger profil"
          onBack={() => router.back()}
          trailing={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Gem"
              disabled={saveDisabled}
              onPress={() => void handleSave()}
              style={({ pressed }) => [
                styles.saveAction,
                saveDisabled && styles.disabled,
                pressed && !saveDisabled && styles.pressed,
              ]}
            >
              {saving ? (
                <ActivityIndicator color={theme.contentPrimary} />
              ) : (
                <Text style={[typography.label, { color: theme.contentPrimary }]}>Gem</Text>
              )}
            </Pressable>
          }
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ProfileSurfaceGroup>
            <AvatarChangeRow
              handle={handle}
              avatarUri={resolveAvatarUrl(avatarUrl)}
              avatarHeaders={avatarHeaders}
              onPress={() => void handlePickPhoto()}
            />
          </ProfileSurfaceGroup>

          <TextField
            label="Brugernavn"
            value={handle}
            onChangeText={setHandle}
            helper={helper?.text}
            helperTone={helper?.tone}
          />

          <TextField
            label="Om mig"
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: space.insetMd,
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
    gap: space.gapLg,
    paddingBottom: space.insetLg,
  },
  saveAction: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.insetSm,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.9,
  },
});
