import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link } from "expo-router";
import { ErrorText, FieldLabel, PrimaryButton, Screen } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import { colors, spacing, typography } from "@/theme/tokens";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.form}
      >
        <Text style={styles.title}>Log ind</Text>
        <Text style={styles.subtitle}>Din fodboldtrøjesamling starter her.</Text>

        <View style={styles.field}>
          <FieldLabel>E-mail</FieldLabel>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
            placeholder="dig@eksempel.dk"
            placeholderTextColor={colors.textMuted}
          />
        </View>

        <View style={styles.field}>
          <FieldLabel>Adgangskode</FieldLabel>
          <TextInput
            secureTextEntry
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
            style={styles.input}
            placeholder="Mindst 8 tegn"
            placeholderTextColor={colors.textMuted}
          />
        </View>

        {error ? <ErrorText>{error}</ErrorText> : null}

        <View style={styles.actions}>
          <PrimaryButton label="Log ind" onPress={() => void handleSubmit()} loading={loading} />
          <Link href="/register" style={styles.link}>
            Opret konto
          </Link>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    flex: 1,
    gap: spacing.md,
  },
  title: {
    fontSize: typography.title,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    fontSize: typography.body,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  field: {
    gap: spacing.xs,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    fontSize: typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  actions: {
    marginTop: spacing.lg,
    gap: spacing.md,
    alignItems: "center",
  },
  link: {
    color: colors.text,
    fontSize: typography.body,
    textDecorationLine: "underline",
  },
});
