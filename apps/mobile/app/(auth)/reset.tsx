import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { requestPasswordReset } from "@/api/identity";
import { AuthThrottleBanner, resolveAuthErrorFeedback } from "@/auth/auth-error-feedback";
import { Button, ButtonDock } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

// Design-system gap: login/reset screens are not in docs/design-system.md
// Scope §Included. Layout uses locked tokens only; no new primitives.

export default function PasswordResetRequestScreen() {
  const router = useRouter();
  const theme = useTheme();
  const typography = useTypography();
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [showThrottleBanner, setShowThrottleBanner] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setFieldError(null);
    setShowThrottleBanner(false);
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setDone(true);
    } catch (error) {
      const feedback = resolveAuthErrorFeedback(error, "Kunne ikke sende nulstilling");
      setFieldError(feedback.fieldError);
      setShowThrottleBanner(feedback.showThrottleBanner);
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
        <Text style={[typography.title, { color: theme.contentPrimary }]}>Nulstil adgangskode</Text>
        <Text style={[typography.body, styles.subtitle, { color: theme.contentMuted }]}>
          Vi sender et link, hvis e-mailen findes. Samme svar hver gang.
        </Text>
        {done ? (
          <Text style={[typography.body, { color: theme.contentPrimary }]}>
            Tjek din e-mail, hvis kontoen findes.
          </Text>
        ) : (
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
        )}
        {showThrottleBanner ? <AuthThrottleBanner /> : null}
        {fieldError ? (
          <Text style={[typography.caption, { color: theme.danger }]}>{fieldError}</Text>
        ) : null}
      </KeyboardAvoidingView>
      <ButtonDock>
        {done ? (
          <Button
            label="Har et link"
            variant="primary"
            width="fill"
            onPress={() => router.push("/reset-complete")}
          />
        ) : (
          <Button
            label="Send link"
            variant="primary"
            width="fill"
            onPress={() => void handleSubmit()}
            loading={loading}
          />
        )}
        <Button label="Tilbage" variant="tertiary" onPress={() => router.replace("/login")} />
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
