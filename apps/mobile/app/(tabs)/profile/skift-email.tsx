import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { changeEmail } from "@/api/identity";
import { useAuth } from "@/auth/AuthProvider";
import { DrillHeader, ProfileSurfaceGroup, TextField } from "@/components/profile-ui";
import { Button, ButtonDock } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export default function SkiftEmailScreen() {
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken, refreshUser } = useAuth();

  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!accessToken) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await changeEmail(accessToken, { email: newEmail.trim(), password });
      await refreshUser();
      router.back();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke skifte e-mail");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.fillSecondary }]}>
      <View style={{ paddingTop: insets.top }}>
        <DrillHeader title="Skift e-mail" onBack={() => router.back()} />
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
                label="Ny e-mail"
                value={newEmail}
                onChangeText={setNewEmail}
                autoCapitalize="none"
              />
            </View>
            <View style={[styles.divider, { backgroundColor: theme.borderSubtle }]} />
            <View style={styles.fieldBlock}>
              <TextField
                label="Adgangskode"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                helper="Bekræft med din nuværende adgangskode."
              />
            </View>
          </ProfileSurfaceGroup>
        </ScrollView>
        <ButtonDock>
          <Button
            label="Gem e-mail"
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
