import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { useAuth } from "@/auth/AuthProvider";
import { DrillHeader, ProfileSurfaceGroup, TextField } from "@/components/profile-ui";
import { Button } from "@/components/ui";
import {
  CODE_REQUEST_FAILED,
  CODE_VERIFY_FAILED,
  RESEND_COUNTDOWN_SECONDS,
} from "@/first-session/code-entry";
import { CodeScreen, type CodeScreenStatus } from "@/first-session/code-screen";
import { useResendCountdown } from "@/first-session/use-resend-countdown";
import {
  codeConfirmed,
  codeSent,
  confirmFailed,
  EMAIL_CHANGE_PROBLEM_MESSAGE,
  type EmailChangeState,
  sendFailed,
  startEmailChange,
  submitAddress,
  typeCode,
} from "@/profile/email-change";
import { confirmEmailChange, requestEmailChangeCode } from "@/profile/email-change-api";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

function codeScreenStatus(state: EmailChangeState): CodeScreenStatus {
  if (state.step === "verifying") {
    return "verifying";
  }
  if (state.problem === "wrong") {
    return "wrong";
  }
  return state.problem === "expired" || state.problem === "throttled" ? "expired" : "idle";
}

export default function EmailChangeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken, user, refreshUser } = useAuth();
  const resendCountdown = useResendCountdown();

  const [state, setState] = useState<EmailChangeState>(startEmailChange);
  const [address, setAddress] = useState("");
  const confirming = useRef(false);

  async function sendCode(sending: EmailChangeState) {
    if (!accessToken) {
      return;
    }
    setState(sending);
    try {
      await requestEmailChangeCode(accessToken, sending.email);
      setState(codeSent(sending));
      resendCountdown.start(RESEND_COUNTDOWN_SECONDS);
    } catch (caught) {
      setState(sendFailed(sending, caught));
    }
  }

  function handleSubmitAddress() {
    const next = submitAddress(state, address, user?.email ?? "");
    if (next.step === "sending") {
      void sendCode(next);
    } else {
      setState(next);
    }
  }

  async function confirm(verifying: EmailChangeState) {
    if (!accessToken || confirming.current) {
      return;
    }
    confirming.current = true;
    try {
      await confirmEmailChange(accessToken, verifying.email, verifying.code);
      setState(codeConfirmed(verifying));
      await refreshUser();
      router.back();
    } catch (caught) {
      const next = confirmFailed(verifying, caught);
      setState(next);
      resendCountdown.clear();
      if (next.problem === "failed") {
        Toast.show({ type: "error", position: "bottom", text1: CODE_VERIFY_FAILED });
      }
    } finally {
      confirming.current = false;
    }
  }

  function handleChangeCode(raw: string) {
    const next = typeCode(state, raw);
    setState(next);
    if (next.step === "verifying") {
      void confirm(next);
    }
  }

  async function handleResend() {
    if (!accessToken || state.step === "verifying") {
      return;
    }
    try {
      await requestEmailChangeCode(accessToken, state.email);
      setState(codeSent(state));
      resendCountdown.start(RESEND_COUNTDOWN_SECONDS);
    } catch {
      Toast.show({ type: "error", position: "bottom", text1: CODE_REQUEST_FAILED });
    }
  }

  function handleBackToAddress() {
    resendCountdown.clear();
    setState({ ...startEmailChange, email: state.email });
  }

  if (state.step === "code" || state.step === "verifying") {
    return (
      <CodeScreen
        email={state.email}
        code={state.code}
        status={codeScreenStatus(state)}
        resendSeconds={resendCountdown.seconds}
        showThrottleBanner={state.problem === "throttled"}
        onChangeCode={handleChangeCode}
        onResend={() => void handleResend()}
        onWrongEmail={handleBackToAddress}
        onBack={handleBackToAddress}
      />
    );
  }

  if (state.step === "done") {
    return null;
  }

  const sending = state.step === "sending";
  return (
    <View style={[styles.container, { backgroundColor: theme.fillSecondary }]}>
      <View style={{ paddingTop: insets.top }}>
        <DrillHeader title="Skift e-mail" onBack={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ProfileSurfaceGroup>
          <View style={styles.fieldBlock}>
            <TextField
              label="Ny e-mail"
              value={address}
              onChangeText={setAddress}
              helper={state.problem ? EMAIL_CHANGE_PROBLEM_MESSAGE[state.problem] : undefined}
              helperTone={state.problem ? "danger" : "secondary"}
            />
          </View>
        </ProfileSurfaceGroup>
        <Button
          label="Send kode"
          variant="primary"
          width="fill"
          loading={sending}
          disabled={sending || address.trim() === ""}
          onPress={handleSubmitAddress}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: space.insetMd,
  },
  content: {
    gap: space.gapLg,
    paddingBottom: space.insetLg,
  },
  fieldBlock: {
    paddingHorizontal: space.insetMd,
    paddingVertical: space.insetSm,
  },
});
