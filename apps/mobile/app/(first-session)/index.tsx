import type { IdentityLinkedProvider } from "@kit/api-contract";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import Toast from "react-native-toast-message";
import { requestSignInCode } from "@/api/identity";
import { useAuth } from "@/auth/AuthProvider";
import { resolveAuthErrorFeedback } from "@/auth/auth-error-feedback";
import { FirstSessionAnalysingScreen } from "@/first-session/analysing-screen";
import { FirstSessionChooserScreen } from "@/first-session/chooser-screen";
import {
  CODE_REQUEST_FAILED,
  CODE_VERIFY_FAILED,
  codeFailureFromError,
  isCompleteCode,
  RESEND_COUNTDOWN_SECONDS,
  sanitizeCode,
} from "@/first-session/code-entry";
import { CodeScreen, type CodeScreenStatus } from "@/first-session/code-screen";
import { exampleById } from "@/first-session/demo";
import { DemoScreen } from "@/first-session/demo-screen";
import { DoorSheet } from "@/first-session/door";
import {
  DOOR_EMAIL_INVALID,
  isValidEmail,
  socialCancelledMessage,
} from "@/first-session/door-copy";
import { JerseyDetailsScreen } from "@/first-session/jersey-details-screen";
import { LEGACY_DOOR_PARAM_VALUE } from "@/first-session/legacy-routes";
import {
  collectionHref,
  createFirstSession,
  firstSessionBackdrop,
  reduceFirstSession,
} from "@/first-session/session";
import { useResendCountdown } from "@/first-session/use-resend-countdown";
import { VisionFailedScreen } from "@/first-session/vision-failed-screen";
import { type ExampleOrigins, WelcomeScreen } from "@/first-session/welcome-screen";
import { LoadingScreen } from "../_layout";

export default function FirstSessionHost() {
  const { user, isLoading, signInSocial, signInWithCode } = useAuth();
  // An old login, register or reset link lands here with ?door=1: Kom i gang opens at once.
  const { door } = useLocalSearchParams<{ door?: string }>();
  const [session, setSession] = useState(() => {
    const first = createFirstSession({ signedIn: false });
    return door === LEGACY_DOOR_PARAM_VALUE
      ? reduceFirstSession(first, { type: "openDoor" })
      : first;
  });
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [showThrottleBanner, setShowThrottleBanner] = useState(false);
  const [socialBusy, setSocialBusy] = useState<IdentityLinkedProvider | null>(null);
  const [demoOrigins, setDemoOrigins] = useState<ExampleOrigins | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [code, setCode] = useState("");
  const [codeStatus, setCodeStatus] = useState<CodeScreenStatus>("idle");
  const resendCountdown = useResendCountdown();
  // A sixth digit and a second tap must not send the same code twice.
  const codeInFlight = useRef(false);

  const dispatch = useCallback((event: Parameters<typeof reduceFirstSession>[1]) => {
    setSession((current) => reduceFirstSession(current, event));
  }, []);

  // The host is already mounted when an old login link arrives while the welcome screen is open.
  useEffect(() => {
    if (door === LEGACY_DOOR_PARAM_VALUE) {
      dispatch({ type: "openDoor" });
    }
  }, [door, dispatch]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (user && session.place === "welcome") {
    return <Redirect href="/(tabs)/collection" />;
  }

  if (session.place === "collection" || session.place === "tab-shell") {
    return <Redirect href={collectionHref(session)} />;
  }

  if (session.place === "jersey-details" && session.captureSessionId) {
    return (
      <JerseyDetailsScreen
        captureSessionId={session.captureSessionId}
        jerseysSavedInSession={session.jerseysSavedInSession}
        onJerseySavedInDump={() => {
          dispatch({ type: "recordDumpSave" });
        }}
        onSaved={() => {
          dispatch({ type: "saveJersey" });
        }}
      />
    );
  }

  function resetDoorFields() {
    setEmail("");
    setEmailError(null);
    setShowThrottleBanner(false);
    setCode("");
    setCodeStatus("idle");
    resendCountdown.clear();
  }

  function openDoor() {
    resetDoorFields();
    dispatch({ type: "openDoor" });
  }

  function closeDoor() {
    resetDoorFields();
    dispatch({ type: "closeDoor" });
  }

  function resetCodeEntry() {
    setCode("");
    setCodeStatus("idle");
    setShowThrottleBanner(false);
  }

  async function handleSubmitEmail() {
    // Return on the e-mail field is not blocked by the disabled button.
    if (socialBusy !== null || emailBusy) {
      return;
    }
    if (!isValidEmail(email)) {
      setEmailError(DOOR_EMAIL_INVALID);
      return;
    }
    setEmailError(null);
    setShowThrottleBanner(false);
    setEmailBusy(true);
    try {
      await requestSignInCode(email.trim());
      resetCodeEntry();
      resendCountdown.start(RESEND_COUNTDOWN_SECONDS);
      dispatch({ type: "submitIdentity", method: "email" });
    } catch (caught) {
      const feedback = resolveAuthErrorFeedback(caught, CODE_REQUEST_FAILED);
      setShowThrottleBanner(feedback.showThrottleBanner);
      setEmailError(feedback.fieldError);
    } finally {
      setEmailBusy(false);
    }
  }

  async function submitCode(value: string) {
    if (codeInFlight.current) {
      return;
    }
    codeInFlight.current = true;
    setCodeStatus("verifying");
    try {
      await signInWithCode(email.trim(), value);
      dispatch({ type: "submitIdentity", method: "code" });
    } catch (caught) {
      setCode("");
      const failure = codeFailureFromError(caught);
      if (failure === "wrong") {
        // Resend is available at once after a wrong code.
        resendCountdown.clear();
        setCodeStatus("wrong");
      } else if (failure === "expired" || failure === "throttled") {
        resendCountdown.clear();
        setShowThrottleBanner(failure === "throttled");
        setCodeStatus("expired");
      } else {
        setCodeStatus("idle");
        Toast.show({ type: "error", position: "bottom", text1: CODE_VERIFY_FAILED });
      }
    } finally {
      codeInFlight.current = false;
    }
  }

  function handleChangeCode(raw: string) {
    if (codeStatus === "verifying" || codeStatus === "expired") {
      return;
    }
    const next = sanitizeCode(raw);
    setCode(next);
    if (next.length > 0 && codeStatus === "wrong") {
      setCodeStatus("idle");
    }
    if (isCompleteCode(next)) {
      void submitCode(next);
    }
  }

  async function handleResend() {
    if (codeStatus === "verifying") {
      return;
    }
    try {
      await requestSignInCode(email.trim());
      resetCodeEntry();
      resendCountdown.start(RESEND_COUNTDOWN_SECONDS);
    } catch (caught) {
      const feedback = resolveAuthErrorFeedback(caught, CODE_REQUEST_FAILED);
      if (feedback.showThrottleBanner) {
        setShowThrottleBanner(true);
      } else {
        Toast.show({ type: "error", position: "bottom", text1: CODE_REQUEST_FAILED });
      }
    }
  }

  function handleWrongEmail() {
    resetCodeEntry();
    resendCountdown.clear();
    dispatch({ type: "backFromCode" });
  }

  async function handleSocial(provider: IdentityLinkedProvider) {
    setEmailError(null);
    setShowThrottleBanner(false);
    setSocialBusy(provider);
    try {
      await signInSocial(provider);
      dispatch({ type: "submitIdentity", method: "social" });
    } catch (caught) {
      setShowThrottleBanner(resolveAuthErrorFeedback(caught, "").showThrottleBanner);
      Toast.show({
        type: "error",
        position: "bottom",
        text1: socialCancelledMessage(provider),
      });
    } finally {
      setSocialBusy(null);
    }
  }

  const backdrop = firstSessionBackdrop(session);

  return (
    <>
      {backdrop === "welcome" ? (
        <WelcomeScreen
          onStartDemo={(exampleId, origins) => {
            setDemoOrigins(origins);
            dispatch({ type: "startDemo", exampleId });
          }}
          onOwnPhoto={() => {
            dispatch({ type: "startAdd" });
          }}
          onHaveAccount={() => openDoor()}
        />
      ) : null}
      {backdrop === "demo" && session.demoExampleId ? (
        <DemoScreen
          example={exampleById(session.demoExampleId)}
          origins={demoOrigins}
          onStart={() => openDoor()}
          onTryAnother={() => {
            dispatch({ type: "demoTryAnother" });
          }}
        />
      ) : null}
      {backdrop === "vision-failed" ? (
        <VisionFailedScreen
          captureSessionId={session.captureSessionId}
          onFillSelf={() => dispatch({ type: "fillSelf" })}
          onTryAnother={() => dispatch({ type: "tryAnotherPhoto" })}
        />
      ) : null}
      {session.place === "chooser" ? (
        <FirstSessionChooserScreen
          onClose={() => dispatch({ type: "cancelChooser" })}
          onPhotosPicked={(sessionId) => dispatch({ type: "photosPicked", sessionId })}
        />
      ) : null}
      {backdrop === "analysing" && session.captureSessionId ? (
        <FirstSessionAnalysingScreen
          captureSessionId={session.captureSessionId}
          onVisionComplete={() => dispatch({ type: "visionComplete" })}
          onVisionFailed={() => dispatch({ type: "visionFailed" })}
          onFillSelf={() => dispatch({ type: "fillSelf" })}
        />
      ) : null}
      {session.place === "code" ? (
        <CodeScreen
          email={email.trim()}
          code={code}
          status={codeStatus}
          resendSeconds={resendCountdown.seconds}
          showThrottleBanner={showThrottleBanner}
          onChangeCode={handleChangeCode}
          onResend={() => {
            void handleResend();
          }}
          onWrongEmail={handleWrongEmail}
          onBack={handleWrongEmail}
        />
      ) : null}
      <DoorSheet
        visible={session.place === "door"}
        email={email}
        emailError={emailError}
        showThrottleBanner={showThrottleBanner}
        socialBusy={socialBusy}
        emailBusy={emailBusy}
        onClose={closeDoor}
        onEmailChange={(value) => {
          setEmail(value);
          setEmailError(null);
        }}
        onSubmit={() => {
          void handleSubmitEmail();
        }}
        onSocial={(provider) => {
          void handleSocial(provider);
        }}
      />
    </>
  );
}
