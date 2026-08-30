import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { changePassword } from "@/api/identity";
import { useAuth } from "@/auth/AuthProvider";
import { DrillHeader, ProfileSurfaceGroup, TextField } from "@/components/profile-ui";
import { Button, ButtonDock } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export default function SkiftAdgangskodeScreen() {
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken, signOut } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!accessToken) {
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("De nye adgangskoder matcher ikke");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await changePassword(accessToken, { currentPassword, newPassword });
      await signOut();
      router.replace("/(auth)/login");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke skifte adgangskode");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.fillSecondary }]}>
      <View style={{ paddingTop: insets.top }}>
        <DrillHeader title="Skift adgangskode" onBack={() => router.back()} />
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          {error ? (
            <Text style={[typography.caption, { color: theme.danger }]}>{error}</Text>
          ) : null}
          <ProfileSurfaceGroup>
            <View style={styles.fieldBlock}>
              <TextField
                label="Nuværende adgangskode"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
              />
            </View>
            <View style={[styles.divider, { backgroundColor: theme.borderSubtle }]} />
            <View style={styles.fieldBlock}>
              <TextField
                label="Ny adgangskode"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />
            </View>
            <View style={[styles.divider, { backgroundColor: theme.borderSubtle }]} />
            <View style={styles.fieldBlock}>
              <TextField
                label="Bekræft ny adgangskode"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
            </View>
          </ProfileSurfaceGroup>
        </ScrollView>
        <ButtonDock>
          <Button
            label="Gem adgangskode"
            variant="primary"
            width="fill"
            loading={loading}
            onPress={() => void submit()}
          />
        </ButtonDock>
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
  content: {
    gap: space.gapMd,
    paddingBottom: space.insetLg,
  },
  fieldBlock: {
    paddingHorizontal: space.insetMd,
    paddingVertical: space.insetSm,
  },
  divider: {
    height: 1,
    marginHorizontal: space.insetMd,
  },
});
