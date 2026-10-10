import { StyleSheet, Text, TextInput, View } from "react-native";
import { AuthThrottleBanner } from "@/auth/auth-error-feedback";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui";
import {
  DOOR_DIVIDER_LABEL,
  DOOR_EMAIL_LABEL,
  DOOR_EMAIL_PLACEHOLDER,
  DOOR_PROVIDER_LABEL,
  DOOR_SUBMIT_LABEL,
  DOOR_TERMS_LINE,
  type DoorSocialProvider,
} from "@/first-session/door-copy";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

const SOCIAL_PROVIDERS: DoorSocialProvider[] = ["google", "facebook"];

/** The single Kom i gang face: e-mail + Fortsæt, divider, equal social buttons, terms line. */
export function KomIGangFace({
  email,
  emailError,
  showThrottleBanner,
  socialBusy,
  onEmailChange,
  onSubmit,
  onSocial,
}: {
  email: string;
  emailError: string | null;
  showThrottleBanner: boolean;
  socialBusy: DoorSocialProvider | null;
  onEmailChange: (value: string) => void;
  onSubmit: () => void;
  onSocial: (provider: DoorSocialProvider) => void;
}) {
  const theme = useTheme();
  const typography = useTypography();
  const busy = socialBusy !== null;

  return (
    <View style={styles.stack}>
      {showThrottleBanner ? <AuthThrottleBanner /> : null}
      <LabeledField
        label={DOOR_EMAIL_LABEL}
        testID="door-email"
        value={email}
        error={emailError}
        onChangeText={onEmailChange}
        onSubmitEditing={onSubmit}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder={DOOR_EMAIL_PLACEHOLDER}
      />
      <Button
        label={DOOR_SUBMIT_LABEL}
        testID="door-submit"
        variant="primary"
        width="fill"
        disabled={busy}
        onPress={onSubmit}
      />
      <View style={styles.divider}>
        <View style={[styles.dividerLine, { backgroundColor: theme.borderSubtle }]} />
        <Text style={[typography.monoSm, { color: theme.contentMuted }]}>{DOOR_DIVIDER_LABEL}</Text>
        <View style={[styles.dividerLine, { backgroundColor: theme.borderSubtle }]} />
      </View>
      <View style={styles.social}>
        {SOCIAL_PROVIDERS.map((provider) => (
          <Button
            key={provider}
            label={DOOR_PROVIDER_LABEL[provider]}
            testID={`door-${provider}`}
            variant="secondary"
            width="fill"
            leading={<BrandMark provider={provider} size={20} accessibilityElementsHidden />}
            loading={socialBusy === provider}
            disabled={busy}
            onPress={() => onSocial(provider)}
          />
        ))}
      </View>
      <Text
        testID="door-terms"
        style={[typography.caption, styles.terms, { color: theme.contentSecondary }]}
      >
        {DOOR_TERMS_LINE}
      </Text>
    </View>
  );
}

function ErrorText({ message, testID }: { message: string; testID?: string }) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <Text
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[typography.caption, { color: theme.danger }]}
    >
      {message}
    </Text>
  );
}

function LabeledField({
  label,
  testID,
  value,
  error,
  onChangeText,
  onSubmitEditing,
  autoCapitalize,
  autoComplete,
  keyboardType,
  placeholder,
}: {
  label: string;
  testID?: string;
  value: string;
  error: string | null;
  onChangeText: (value: string) => void;
  onSubmitEditing: () => void;
  autoCapitalize?: "none" | "sentences";
  autoComplete?: "email";
  keyboardType?: "email-address";
  placeholder?: string;
}) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <View style={styles.field}>
      <Text style={[typography.label, { color: theme.contentPrimary }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        testID={testID}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        keyboardType={keyboardType}
        returnKeyType="go"
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor={theme.contentMuted}
        style={[
          styles.input,
          typography.body,
          {
            borderColor: error ? theme.danger : theme.borderSubtle,
            color: theme.contentPrimary,
            backgroundColor: theme.surface,
          },
        ]}
      />
      {error ? <ErrorText testID="door-email-error" message={error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: space.gapMd,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  social: {
    gap: space.gapSm,
  },
  terms: {
    textAlign: "center",
  },
  field: {
    gap: space.gapSm,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.insetMd,
    paddingVertical: space.insetSm,
  },
});
