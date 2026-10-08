import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { completePasswordReset } from "@/api/identity";
import { Button, ButtonDock } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

// Design-system gap: login/reset screens are not in docs/design-system.md
// Scope §Included. Layout uses locked tokens only; no new primitives.

export default function PasswordResetCompleteScreen() {
  const router = useRouter();
  const theme = useTheme();
  const typography = useTypography();
  const params = useLocalSearchParams<{ token?: string }>();
  const [token, setToken] = useState(typeof params.token === "string" ? params.token : "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      await completePasswordReset(token.trim(), password);
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
        <Text style={[typography.title, { color: theme.contentPrimary }]}>Ny adgangskode</Text>
        <Text style={[typography.body, styles.subtitle, { color: theme.contentMuted }]}>
          Sæt en ny adgangskode. Andre sessioner lukkes.
        </Text>
        {done ? (
          <Text style={[typography.body, { color: theme.contentPrimary }]}>
            Adgangskoden er skiftet. Log ind igen.
          </Text>
        ) : (
          <>
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
            <View style={styles.field}>
              <Text style={[typography.label, { color: theme.contentPrimary }]}>
                Ny adgangskode
              </Text>
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
          </>
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
            label="Gem adgangskode"
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
