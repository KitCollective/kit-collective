import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AuthThrottleBanner } from "@/auth/auth-error-feedback";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui";
import {
  DOOR_SPLITTER_LABEL,
  type DoorMode,
  type DoorSocialProvider,
  doorPasswordSubmitLabel,
  doorSwapLabel,
  FORGOT_PASSWORD_DONE,
  FORGOT_PASSWORD_INFO,
  FORGOT_PASSWORD_LABEL,
  FORGOT_PASSWORD_SUBMIT,
  PASSWORD_HELPER,
  PASSWORD_REPEAT_LABEL,
} from "@/first-session/door-copy";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

const SOCIAL_PROVIDERS: { provider: DoorSocialProvider; name: string }[] = [
  { provider: "google", name: "Google" },
  { provider: "facebook", name: "Facebook" },
];

export function AuthFace({
  mode,
  email,
  password,
  passwordRepeat,
  error,
  showThrottleBanner,
  loading,
  socialBusy,
  busy,
  onEmailChange,
  onPasswordChange,
  onPasswordRepeatChange,
  onSubmit,
  onSocial,
  onForgotPassword,
  onSwapMode,
}: {
  mode: DoorMode;
  email: string;
  password: string;
  passwordRepeat: string;
  error: string | null;
  showThrottleBanner: boolean;
  loading: boolean;
  socialBusy: DoorSocialProvider | null;
  busy: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onPasswordRepeatChange: (value: string) => void;
  onSubmit: () => void;
  onSocial: (provider: DoorSocialProvider) => void;
  onForgotPassword: () => void;
  onSwapMode: () => void;
}) {
  const theme = useTheme();
  const typography = useTypography();
  const isRegister = mode === "register";

  return (
    <View style={styles.authFace}>
      <View style={styles.stack}>
        {showThrottleBanner ? <AuthThrottleBanner /> : null}
        <LabeledField
          label="E-mail"
          value={email}
          onChangeText={onEmailChange}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="dig@eksempel.dk"
        />
        <LabeledField
          label="Adgangskode"
          value={password}
          onChangeText={onPasswordChange}
          autoCapitalize="none"
          autoComplete={isRegister ? "new-password" : "password"}
          secureTextEntry
          helper={isRegister ? PASSWORD_HELPER : undefined}
        />
        {isRegister ? (
          <LabeledField
            label={PASSWORD_REPEAT_LABEL}
            value={passwordRepeat}
            onChangeText={onPasswordRepeatChange}
            autoCapitalize="none"
            autoComplete="new-password"
            secureTextEntry
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={FORGOT_PASSWORD_LABEL}
            disabled={busy}
            onPress={onForgotPassword}
            style={({ pressed }) => [styles.forgotHit, pressed && styles.pressed]}
          >
            <Text style={[typography.label, { color: theme.contentSecondary }]}>
              {FORGOT_PASSWORD_LABEL}
            </Text>
          </Pressable>
        )}
        {error ? <ErrorText message={error} /> : null}
        <Button
          label={doorPasswordSubmitLabel(mode)}
          variant="primary"
          width="fill"
          loading={loading}
          disabled={busy}
          onPress={onSubmit}
        />
        <View style={styles.splitter}>
          <View style={[styles.splitterLine, { backgroundColor: theme.borderSubtle }]} />
          <Text style={[typography.monoSm, { color: theme.contentMuted }]}>
            {DOOR_SPLITTER_LABEL}
          </Text>
          <View style={[styles.splitterLine, { backgroundColor: theme.borderSubtle }]} />
        </View>
        <View style={styles.socialRow}>
          {SOCIAL_PROVIDERS.map((item) => (
            <SocialIconButton
              key={item.provider}
              provider={item.provider}
              name={item.name}
              disabled={busy}
              loading={socialBusy === item.provider}
              onPress={() => onSocial(item.provider)}
            />
          ))}
        </View>
      </View>
      <Button
        label={doorSwapLabel(mode)}
        variant="tertiary"
        width="fill"
        disabled={busy}
        onPress={onSwapMode}
      />
    </View>
  );
}

export function ForgotPasswordFace({
  email,
  loading,
  done,
  error,
  showThrottleBanner,
  onEmailChange,
  onSubmit,
}: {
  email: string;
  loading: boolean;
  done: boolean;
  error: string | null;
  showThrottleBanner: boolean;
  onEmailChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <View style={styles.stack}>
      <Text style={[typography.body, { color: theme.contentSecondary }]}>{FORGOT_PASSWORD_INFO}</Text>
      {showThrottleBanner ? <AuthThrottleBanner /> : null}
      {done ? (
        <Text style={[typography.body, { color: theme.contentPrimary }]}>{FORGOT_PASSWORD_DONE}</Text>
      ) : (
        <>
          <LabeledField
            label="E-mail"
            value={email}
            onChangeText={onEmailChange}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="dig@eksempel.dk"
          />
          {error ? <ErrorText message={error} /> : null}
          <Button
            label={FORGOT_PASSWORD_SUBMIT}
            variant="primary"
            width="fill"
            loading={loading}
            disabled={loading}
            onPress={onSubmit}
          />
        </>
      )}
    </View>
  );
}

function ErrorText({ message }: { message: string }) {
  const theme = useTheme();
  const typography = useTypography();

  return <Text style={[typography.caption, { color: theme.danger }]}>{message}</Text>;
}

function LabeledField({
  label,
  value,
  onChangeText,
  helper,
  autoCapitalize,
  autoComplete,
  keyboardType,
  secureTextEntry,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  helper?: string;
  autoCapitalize?: "none" | "sentences";
  autoComplete?: "email" | "password" | "new-password";
  keyboardType?: "email-address";
  secureTextEntry?: boolean;
  placeholder?: string;
}) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <View style={styles.field}>
      <Text style={[typography.label, { color: theme.contentPrimary }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.contentMuted}
        style={[
          styles.input,
          typography.body,
          {
            borderColor: theme.borderSubtle,
            color: theme.contentPrimary,
            backgroundColor: theme.surface,
          },
        ]}
      />
      {helper ? (
        <Text style={[typography.caption, { color: theme.contentSecondary }]}>{helper}</Text>
      ) : null}
    </View>
  );
}

function SocialIconButton({
  provider,
  name,
  disabled,
  loading,
  onPress,
}: {
  provider: DoorSocialProvider;
  name: string;
  disabled: boolean;
  loading: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.socialButton,
        {
          borderColor: theme.borderSubtle,
          backgroundColor: theme.surface,
        },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View style={loading ? styles.disabled : undefined}>
        <BrandMark provider={provider} accessibilityElementsHidden />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  authFace: {
    flexGrow: 1,
    justifyContent: "space-between",
    gap: space.gapLg,
  },
  stack: {
    gap: space.gapMd,
  },
  splitter: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
  },
  splitterLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  socialRow: {
    flexDirection: "row",
    gap: space.gapMd,
  },
  socialButton: {
    flex: 1,
    minHeight: 56,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
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
  forgotHit: {
    minHeight: 44,
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.5,
  },
});
