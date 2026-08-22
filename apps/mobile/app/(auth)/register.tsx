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
import { color, radius, space, type } from "@/theme/tokens";

export default function RegisterScreen() {
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
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.form}
      >
        <Text style={styles.title}>Opret konto</Text>
        <Text style={styles.subtitle}>Gem dine trøjer ét sted.</Text>

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
            placeholderTextColor={color.contentMuted}
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
            placeholderTextColor={color.contentMuted}
          />
        </View>

        {error ? <ErrorText>{error}</ErrorText> : null}

        <View style={styles.actions}>
          <PrimaryButton label="Opret konto" onPress={() => void handleSubmit()} loading={loading} />
          <Link href="/login" style={styles.link}>
            Har du allerede en konto?
          </Link>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    flex: 1,
    gap: space.gapMd,
  },
  title: {
    fontSize: type.title.fontSize,
    lineHeight: type.title.lineHeight,
    fontWeight: type.title.fontWeight,
    color: color.contentPrimary,
  },
  subtitle: {
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    color: color.contentMuted,
    marginBottom: space.insetMd,
  },
  field: {
    gap: space.xs,
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
  actions: {
    marginTop: space.insetLg,
    gap: space.gapMd,
    alignItems: "center",
  },
  link: {
    color: color.contentPrimary,
    fontSize: type.body.fontSize,
    textDecorationLine: "underline",
  },
});
