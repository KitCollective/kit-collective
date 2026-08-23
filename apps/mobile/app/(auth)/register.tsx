import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button, ButtonDock } from "@/components/ui";
import { color, radius, space, type } from "@/theme/tokens";

// Design-system gap (KIT-23): login/register screens are not in docs/design-system.md
// Scope §Included or §Deferred. Layout uses locked tokens only; no new primitives.

export default function RegisterScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
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
    <View style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.body}
      >
        <Text style={styles.title}>Opret konto</Text>
        <Text style={styles.subtitle}>Gem dine trøjer ét sted.</Text>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>E-mail</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
            placeholder="dig@eksempel.dk"
            placeholderTextColor={color.contentMuted}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Adgangskode</Text>
          <TextInput
            secureTextEntry
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
            style={styles.input}
            placeholder="Mindst 8 tegn"
            placeholderTextColor={color.contentMuted}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
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
    backgroundColor: color.canvas,
  },
  body: {
    flex: 1,
    gap: space.gapMd,
    paddingHorizontal: space.insetLg,
    paddingTop: space.insetLg,
  },
  title: {
    fontFamily: type.title.fontFamily,
    fontSize: type.title.fontSize,
    lineHeight: type.title.lineHeight,
    letterSpacing: type.title.letterSpacing,
    color: color.contentPrimary,
  },
  subtitle: {
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    color: color.contentMuted,
    marginBottom: space.insetMd,
  },
  field: {
    gap: space.gapSm,
  },
  fieldLabel: {
    color: color.contentPrimary,
    fontFamily: type.label.fontFamily,
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: color.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: space.insetMd,
    fontSize: type.body.fontSize,
    color: color.contentPrimary,
    backgroundColor: color.surface,
  },
  error: {
    color: color.danger,
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    marginTop: space.gapSm,
  },
});
