import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthThrottleBanner } from "@/auth/auth-error-feedback";
import { Button } from "@/components/ui";
import {
  CODE_BACK_LABEL,
  CODE_CELL_COUNT,
  CODE_EXPIRED_MESSAGE,
  CODE_RESEND_EXPIRED_LABEL,
  CODE_WRONG_EMAIL_LABEL,
  CODE_WRONG_MESSAGE,
  codeProgressLabel,
  codeTitle,
  resendLabel,
} from "@/first-session/code-copy";
import { useTypography } from "@/theme/brand-fonts";
import { fontFamily, radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export type CodeScreenStatus = "idle" | "verifying" | "wrong" | "expired";

export type CodeScreenProps = {
  email: string;
  /** Digits typed so far, "" to 6 characters, already sanitised by the host. */
  code: string;
  status: CodeScreenStatus;
  /** Seconds left before Send igen is allowed; 0 or less means it is enabled. */
  resendSeconds: number;
  showThrottleBanner: boolean;
  /** Raw text from the input; the host sanitises (digits only, max 6) and decides when to submit. */
  onChangeCode: (value: string) => void;
  /** Send igen (enabled) or Send ny kode (status "expired"). */
  onResend: () => void;
  onWrongEmail: () => void;
  onBack: () => void;
};

const CELLS = Array.from({ length: CODE_CELL_COUNT }, (_, index) => index);
// Autofill and paste may carry spaces or a longer string; the host trims it.
const INPUT_MAX_LENGTH = 16;

/**
 * The e-mail code step of the first session. One transparent input drives six
 * boxes, so paste and one-time-code autofill both work; the sixth digit is
 * submitted by the host, there is no submit button. Errors use `danger` on the
 * box border and the message only.
 */
export function CodeScreen({
  email,
  code,
  status,
  resendSeconds,
  showThrottleBanner,
  onChangeCode,
  onResend,
  onWrongEmail,
  onBack,
}: CodeScreenProps) {
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  const expired = status === "expired";
  const wrong = status === "wrong";
  const verifying = status === "verifying";
  const showError = wrong || expired;
  const focusIndex = Math.min(code.length, CODE_CELL_COUNT - 1);
  const resendEnabled = resendSeconds <= 0;

  // A new code makes the boxes editable again; the keyboard must come back with them.
  useEffect(() => {
    if (!expired) {
      inputRef.current?.focus();
    }
  }, [expired]);

  return (
    <View
      testID="code-screen"
      style={[
        styles.root,
        { backgroundColor: theme.canvas, paddingTop: insets.top + space.insetLg },
      ]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.avoider}
      >
        <View style={styles.body}>
          <View style={styles.titleBlock}>
            <Text
              accessibilityRole="header"
              testID="code-title"
              style={[typography.title, { color: theme.contentPrimary }]}
            >
              {codeTitle(email)}
            </Text>
            <Pressable
              accessibilityRole="button"
              testID="code-wrong-email"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={onWrongEmail}
              style={({ pressed }) => [styles.wrongEmail, pressed && styles.pressed]}
            >
              <Text style={[typography.label, styles.underline, { color: theme.contentPrimary }]}>
                {CODE_WRONG_EMAIL_LABEL}
              </Text>
            </Pressable>
          </View>

          {showThrottleBanner ? <AuthThrottleBanner /> : null}

          <View style={[styles.cells, expired && styles.disabled]}>
            {CELLS.map((index) => {
              const digit = code[index] ?? "";
              const focused = status === "idle" && index === focusIndex;
              return (
                <View
                  key={index}
                  testID={`code-box-${index}`}
                  style={[
                    styles.cell,
                    { backgroundColor: theme.fillSecondary },
                    focused && {
                      backgroundColor: theme.canvas,
                      borderWidth: 2,
                      borderColor: theme.contentPrimary,
                    },
                    wrong && {
                      backgroundColor: theme.canvas,
                      borderWidth: 1,
                      borderColor: theme.danger,
                    },
                  ]}
                >
                  <Text style={[styles.digit, { color: theme.contentPrimary }]}>{digit}</Text>
                </View>
              );
            })}
            <TextInput
              ref={inputRef}
              testID="code-input"
              value={code}
              onChangeText={(value) => {
                if (!verifying) {
                  onChangeCode(value);
                }
              }}
              editable={!expired}
              autoFocus
              caretHidden
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={INPUT_MAX_LENGTH}
              selectionColor="transparent"
              accessibilityLabel={codeProgressLabel(code.length)}
              style={styles.hiddenInput}
            />
          </View>

          {showError ? (
            <Text
              testID="code-error"
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              style={[typography.labelSm, styles.errorText, { color: theme.danger }]}
            >
              {expired ? CODE_EXPIRED_MESSAGE : CODE_WRONG_MESSAGE}
            </Text>
          ) : null}

          {expired ? (
            <Button
              label={CODE_RESEND_EXPIRED_LABEL}
              variant="primary"
              width="fill"
              testID="code-resend"
              onPress={onResend}
            />
          ) : (
            <View style={styles.pillRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !resendEnabled }}
                disabled={!resendEnabled}
                testID="code-resend"
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                onPress={onResend}
                style={({ pressed }) => [
                  styles.pill,
                  { backgroundColor: theme.fillSecondary },
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    typography.labelSm,
                    { color: resendEnabled ? theme.contentPrimary : theme.contentMuted },
                  ]}
                >
                  {resendLabel(resendSeconds)}
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.insetMd) }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={CODE_BACK_LABEL}
            testID="code-back"
            onPress={onBack}
            style={({ pressed }) => [
              styles.back,
              { backgroundColor: theme.fillSecondary },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="arrow-back"
              size={20}
              color={theme.contentPrimary}
              accessibilityElementsHidden
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: space.insetLg,
  },
  avoider: {
    flex: 1,
  },
  body: {
    flex: 1,
    gap: space.insetLg,
  },
  titleBlock: {
    gap: 10,
  },
  wrongEmail: {
    alignSelf: "flex-start",
  },
  underline: {
    textDecorationLine: "underline",
  },
  cells: {
    flexDirection: "row",
    gap: space.insetSm,
  },
  cell: {
    flex: 1,
    height: 56,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  // Paper "First session / 06": IBM Plex Mono 22/28. The lock has no code-digit role (flagged).
  digit: {
    fontFamily: fontFamily.mono,
    fontSize: 22,
    lineHeight: 28,
  },
  hiddenInput: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0.02,
    color: "transparent",
  },
  errorText: {
    marginTop: -space.insetSm,
  },
  pillRow: {
    flexDirection: "row",
  },
  pill: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: radius.pill,
  },
  footer: {
    flexDirection: "row",
    paddingTop: space.insetMd,
  },
  back: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.9,
  },
});
