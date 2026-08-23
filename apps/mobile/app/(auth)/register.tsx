import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button, ButtonDock } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

// Design-system gap (KIT-23): login/register screens are not in docs/design-system.md
// Scope §Included or §Deferred. Layout uses locked tokens only; no new primitives.

export default function RegisterScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const theme = useTheme();
  const typography = useTypography();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    setLoading(true);

    try {
      await signUp(email.trim(), password);
    } catch {
      setError("Kunne ikke oprette konto. Tjek e-mail og adgangskode.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.canvas }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.body}
      >
        <Text style={[typography.title, { color: theme.contentPrimary }]}>Opret konto</Text>
        <Text style={[typography.body, styles.subtitle, { color: theme.contentMuted }]}>
          Gem dine trøjer ét sted.
        </Text>

        <View style={styles.field}>
          <Text style={[typography.label, { color: theme.contentPrimary }]}>E-mail</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            style={[
              styles.input,
              typography.body,
              {
                borderColor: theme.borderSubtle,
                color: theme.contentPrimary,
                backgroundColor: theme.surface,
              },
            ]}
            placeholder="dig@eksempel.dk"
            placeholderTextColor={theme.contentMuted}
          />
        </View>

        <View style={styles.field}>
          <Text style={[typography.label, { color: theme.contentPrimary }]}>Adgangskode</Text>
          <TextInput
            secureTextEntry
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
            style={[
              styles.input,
              typography.body,
              {
                borderColor: theme.borderSubtle,
                color: theme.contentPrimary,
                backgroundColor: theme.surface,
              },
            ]}
            placeholder="Mindst 8 tegn"
            placeholderTextColor={theme.contentMuted}
          />
        </View>

        {error ? (
          <Text style={[typography.caption, { color: theme.danger }]}>{error}</Text>
        ) : null}
      </KeyboardAvoidingView>

      <ButtonDock>
        <Button
          label="Opret konto"
          variant="primary"
          width="fill"
          onPress={() => void handleSubmit()}
          loading={loading}
        />
        <Button
          label="Har du allerede en konto?"
          variant="tertiary"
          onPress={() => router.push("/login")}
        />
      </ButtonDock>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  body: {
    flex: 1,
    gap: space.gapMd,
    paddingHorizontal: space.insetLg,
    paddingTop: space.insetLg,
  },
  subtitle: {
    marginBottom: space.insetMd,
  },
  field: {
    gap: space.gapSm,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.insetMd,
  },
});
