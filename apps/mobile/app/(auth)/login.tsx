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
import { Button } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import { color, radius, space, type } from "@/theme/tokens";

// Design-system gap (KIT-23): login/register screens are not in docs/design-system.md
// Scope §Included or §Deferred. Layout uses locked tokens only; no new primitives.

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
    <View style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.form}
      >
        <Text style={styles.title}>Log ind</Text>
        <Text style={styles.subtitle}>Din fodboldtrøjesamling starter her.</Text>

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

        <View style={styles.actions}>
          <Button label="Log ind" variant="primary" onPress={() => void handleSubmit()} loading={loading} />
          <Link href="/register" style={styles.link}>
            Opret konto
          </Link>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.canvas,
    paddingHorizontal: space.insetLg,
    paddingTop: space.xl,
  },
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
  fieldLabel: {
    color: color.contentPrimary,
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    fontWeight: type.label.fontWeight,
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
