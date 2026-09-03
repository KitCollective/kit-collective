import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Sheet } from "@/components/catalog-ui";
import { Button, IconButton } from "@/components/ui";
import {
  DOOR_SPLITTER_LABEL,
  type DoorEmailStep,
  type DoorMode,
  type DoorSocialProvider,
  doorEmailCtaLabel,
  doorPasswordSubmitLabel,
  doorSentence,
  doorStepCaption,
  doorSwapLabel,
  doorTitle,
  EMAIL_CHANGE_LABEL,
  EMAIL_NEXT_LABEL,
  FORGOT_PASSWORD_LABEL,
  PASSWORD_HELPER,
  PASSWORD_REPEAT_LABEL,
} from "@/first-session/door-copy";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export type { DoorEmailStep, DoorMode, DoorSocialProvider } from "@/first-session/door-copy";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

type DoorSheetProps = {
  visible: boolean;
  mode: DoorMode;
  emailStep: DoorEmailStep;
  email: string;
  password: string;
  passwordRepeat: string;
  error: string | null;
  loading: boolean;
  socialBusy: DoorSocialProvider | null;
  onClose: () => void;
  onSwapMode: () => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onPasswordRepeatChange: (value: string) => void;
  onNextEmail: () => void;
  onChangeEmail: () => void;
  onSubmitEmail: () => void;
  onSocial: (provider: DoorSocialProvider) => void;
  onForgotPassword: () => void;
  onBackStep?: () => void;
};

const SOCIAL_PROVIDERS: { provider: DoorSocialProvider; icon: IoniconName; name: string }[] = [
  { provider: "google", icon: "logo-google", name: "Google" },
  { provider: "facebook", icon: "logo-facebook", name: "Facebook" },
];

export function DoorSheet({
  visible,
  mode,
  emailStep,
  email,
  password,
  passwordRepeat,
  error,
  loading,
  socialBusy,
  onClose,
  onSwapMode,
  onEmailChange,
  onPasswordChange,
  onPasswordRepeatChange,
  onNextEmail,
  onChangeEmail,
  onSubmitEmail,
  onSocial,
  onForgotPassword,
  onBackStep,
}: DoorSheetProps) {
  const insets = useSafeAreaInsets();
  const busy = loading || socialBusy !== null;
  const showBack = emailStep !== "choose";
  const handleBack = onBackStep ?? (emailStep === 2 ? onChangeEmail : undefined);

  return (
    <Sheet
      visible={visible}
      variant="door"
      title={doorTitle(mode)}
      sentence={doorSentence(mode)}
      onDismiss={onClose}
      leading={
        showBack && handleBack ? (
          <IconButton name="Tilbage" icon="chevron-back" onPress={handleBack} />
        ) : undefined
      }
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.avoider}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.body,
            { paddingBottom: Math.max(insets.bottom, space.insetMd) },
          ]}
        >
          {emailStep === "choose" ? (
            <ChooseStep
              mode={mode}
              busy={busy}
              socialBusy={socialBusy}
              onNextEmail={onNextEmail}
              onSocial={onSocial}
              onSwapMode={onSwapMode}
            />
          ) : emailStep === 1 ? (
            <EmailAddressStep
              email={email}
              busy={busy}
              error={error}
              onEmailChange={onEmailChange}
              onNextEmail={onNextEmail}
            />
          ) : (
            <EmailPasswordStep
              mode={mode}
              email={email}
              password={password}
              passwordRepeat={passwordRepeat}
              loading={loading}
              busy={busy}
              error={error}
              onPasswordChange={onPasswordChange}
              onPasswordRepeatChange={onPasswordRepeatChange}
              onSubmitEmail={onSubmitEmail}
              onForgotPassword={onForgotPassword}
              onChangeEmail={onChangeEmail}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Sheet>
  );
}

function ChooseStep({
  mode,
  busy,
  socialBusy,
  onNextEmail,
  onSocial,
  onSwapMode,
}: {
  mode: DoorMode;
  busy: boolean;
  socialBusy: DoorSocialProvider | null;
  onNextEmail: () => void;
  onSocial: (provider: DoorSocialProvider) => void;
  onSwapMode: () => void;
}) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <View style={styles.stack}>
      <Button
        label={doorEmailCtaLabel(mode)}
        variant="primary"
        width="fill"
        disabled={busy}
        onPress={onNextEmail}
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
            name={item.name}
            icon={item.icon}
            disabled={busy}
            loading={socialBusy === item.provider}
            onPress={() => onSocial(item.provider)}
          />
        ))}
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

function EmailAddressStep({
  email,
  busy,
  error,
  onEmailChange,
  onNextEmail,
}: {
  email: string;
  busy: boolean;
  error: string | null;
  onEmailChange: (value: string) => void;
  onNextEmail: () => void;
}) {
  return (
    <View style={styles.stack}>
      <StepCaption step={1} />
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
        label={EMAIL_NEXT_LABEL}
        variant="primary"
        width="fill"
        disabled={busy}
        onPress={onNextEmail}
      />
    </View>
  );
}

function EmailPasswordStep({
  mode,
  email,
  password,
  passwordRepeat,
  loading,
  busy,
  error,
  onPasswordChange,
  onPasswordRepeatChange,
  onSubmitEmail,
  onForgotPassword,
  onChangeEmail,
}: {
  mode: DoorMode;
  email: string;
  password: string;
  passwordRepeat: string;
  loading: boolean;
  busy: boolean;
  error: string | null;
  onPasswordChange: (value: string) => void;
  onPasswordRepeatChange: (value: string) => void;
  onSubmitEmail: () => void;
  onForgotPassword: () => void;
  onChangeEmail: () => void;
}) {
  const theme = useTheme();
  const typography = useTypography();
  const isRegister = mode === "register";

  return (
    <View style={styles.stack}>
      <StepCaption step={2} />
      <View style={styles.emailRow}>
        <Text style={[typography.body, styles.emailValue, { color: theme.contentSecondary }]}>
          {email}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={EMAIL_CHANGE_LABEL}
          disabled={busy}
          onPress={onChangeEmail}
          style={({ pressed }) => [styles.changeHit, pressed && styles.pressed]}
        >
          <Text style={[typography.label, { color: theme.contentPrimary }]}>
            {EMAIL_CHANGE_LABEL}
          </Text>
        </Pressable>
      </View>
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
        <Button
          label={FORGOT_PASSWORD_LABEL}
          variant="tertiary"
          width="fill"
          disabled={busy}
          onPress={onForgotPassword}
        />
      )}
      {error ? <ErrorText message={error} /> : null}
      <Button
        label={doorPasswordSubmitLabel(mode)}
        variant="primary"
        width="fill"
        loading={loading}
        disabled={busy}
        onPress={onSubmitEmail}
      />
    </View>
  );
}

function StepCaption({ step }: { step: 1 | 2 }) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <Text style={[typography.monoSm, { color: theme.contentMuted }]}>{doorStepCaption(step)}</Text>
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
  name,
  icon,
  disabled,
  loading,
  onPress,
}: {
  name: string;
  icon: IoniconName;
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
      <Ionicons
        name={icon}
        size={24}
        color={theme.contentPrimary}
        accessibilityElementsHidden
        style={loading ? styles.disabled : undefined}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avoider: {
    maxHeight: "100%",
  },
  body: {
    gap: space.gapMd,
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
    minHeight: 56,
    minWidth: 56,
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
  emailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
    minHeight: 44,
  },
  emailValue: {
    flex: 1,
  },
  changeHit: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.5,
  },
});
