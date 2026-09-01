import type { IdentityLinkedProvider } from "@kit/api-contract";
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
// KIT-176: Social continue actions are not in the lock. Button dock secondary fill is
// Cookie-indstillinger only — using locked secondary + fill, no provider-colored chrome.

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, signInSocial } = useAuth();
  const theme = useTheme();
  const typography = useTypography();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [socialProvider, setSocialProvider] = useState<IdentityLinkedProvider | null>(null);

  async function handleSubmit() {
    setError(null);
    setLoading(true);

    try {
      await signIn(email.trim(), password);
    } catch {
      setError("Forkert e-mail eller adgangskode");
    } finally {
      setLoading(false);
    }
  }

  async function handleSocial(provider: IdentityLinkedProvider) {
    setError(null);
    setSocialProvider(provider);

    try {
      await signInSocial(provider);
    } catch {
      setError("Kunne ikke logge ind");
    } finally {
      setSocialProvider(null);
    }
  }

  const busy = loading || socialProvider !== null;

  return (
    <View style={[styles.screen, { backgroundColor: theme.canvas }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.body}
      >
        <Text style={[typography.title, { color: theme.contentPrimary }]}>Log ind</Text>
        <Text style={[typography.body, styles.subtitle, { color: theme.contentMuted }]}>
          Din fodboldtrøjesamling starter her.
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

        {error ? <Text style={[typography.caption, { color: theme.danger }]}>{error}</Text> : null}
      </KeyboardAvoidingView>

      <ButtonDock>
        <Button
          label="Log ind"
          variant="primary"
          width="fill"
          onPress={() => void handleSubmit()}
          loading={loading}
          disabled={busy}
        />
        <Button
          label="Fortsæt med Google"
          variant="secondary"
          width="fill"
          onPress={() => void handleSocial("google")}
          loading={socialProvider === "google"}
          disabled={busy}
        />
        <Button
          label="Fortsæt med Facebook"
          variant="secondary"
          width="fill"
          onPress={() => void handleSocial("facebook")}
          loading={socialProvider === "facebook"}
          disabled={busy}
        />
        <Button
          label="Glemt adgangskode"
          variant="tertiary"
          onPress={() => router.push("/reset")}
        />
        <Button label="Opret konto" variant="tertiary" onPress={() => router.push("/register")} />
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
