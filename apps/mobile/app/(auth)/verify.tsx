import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { verifyEmail } from "@/api/identity";
import { Button, ButtonDock } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

// Design-system gap: login/verify screens are not in docs/design-system.md
// Scope §Included. Layout uses locked tokens only; no new primitives.

export default function VerifyEmailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const typography = useTypography();
  const params = useLocalSearchParams<{ token?: string }>();
  const [token, setToken] = useState(typeof params.token === "string" ? params.token : "");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      await verifyEmail(token.trim());
      setDone(true);
    } catch {
      setError("Linket er ugyldigt eller udløbet");
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
        <Text style={[typography.title, { color: theme.contentPrimary }]}>Bekræft e-mail</Text>
        <Text style={[typography.body, styles.subtitle, { color: theme.contentMuted }]}>
          Indtast koden fra e-mailen, eller åbn linket vi sendte.
        </Text>
        {done ? (
          <Text style={[typography.body, { color: theme.contentPrimary }]}>
            E-mailen er bekræftet.
          </Text>
        ) : (
          <View style={styles.field}>
            <Text style={[typography.label, { color: theme.contentPrimary }]}>Kode</Text>
            <TextInput
              autoCapitalize="none"
              value={token}
              onChangeText={setToken}
              style={[
                styles.input,
                typography.body,
                {
                  borderColor: theme.borderSubtle,
                  color: theme.contentPrimary,
                  backgroundColor: theme.surface,
                },
              ]}
              placeholder="Kode fra e-mail"
              placeholderTextColor={theme.contentMuted}
            />
          </View>
        )}
        {error ? <Text style={[typography.caption, { color: theme.danger }]}>{error}</Text> : null}
      </KeyboardAvoidingView>
      <ButtonDock>
        {done ? (
          <Button
            label="Log ind"
            variant="primary"
            width="fill"
            onPress={() => router.replace("/login")}
          />
        ) : (
          <Button
            label="Bekræft"
            variant="primary"
            width="fill"
            onPress={() => void handleSubmit()}
            loading={loading}
          />
        )}
      </ButtonDock>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: {
    flex: 1,
    gap: space.gapMd,
    paddingHorizontal: space.insetLg,
    paddingTop: space.insetLg,
  },
  subtitle: { marginBottom: space.insetMd },
  field: { gap: space.gapSm },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.insetMd,
  },
});
