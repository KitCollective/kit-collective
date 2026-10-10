import type { IdentityLinkedProvider } from "@kit/api-contract";
import { Redirect } from "expo-router";
import { useCallback, useState } from "react";
import Toast from "react-native-toast-message";
import { useAuth } from "@/auth/AuthProvider";
import { resolveAuthErrorFeedback } from "@/auth/auth-error-feedback";
import { FirstSessionAnalysingScreen } from "@/first-session/analysing-screen";
import { FirstSessionChooserScreen } from "@/first-session/chooser-screen";
import { CodeStub } from "@/first-session/code-stub";
import { exampleById } from "@/first-session/demo";
import { DemoScreen } from "@/first-session/demo-screen";
import { DoorSheet } from "@/first-session/door";
import {
  DOOR_EMAIL_INVALID,
  isValidEmail,
  socialCancelledMessage,
} from "@/first-session/door-copy";
import { JerseyDetailsScreen } from "@/first-session/jersey-details-screen";
import {
  collectionHref,
  createFirstSession,
  firstSessionBackdrop,
  reduceFirstSession,
} from "@/first-session/session";
import { VisionFailedScreen } from "@/first-session/vision-failed-screen";
import { type ExampleOrigins, WelcomeScreen } from "@/first-session/welcome-screen";
import { LoadingScreen } from "../_layout";

export default function FirstSessionHost() {
  const { user, isLoading, signInSocial } = useAuth();
  const [session, setSession] = useState(() => createFirstSession({ signedIn: false }));
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [showThrottleBanner, setShowThrottleBanner] = useState(false);
  const [socialBusy, setSocialBusy] = useState<IdentityLinkedProvider | null>(null);
  const [demoOrigins, setDemoOrigins] = useState<ExampleOrigins | null>(null);

  const dispatch = useCallback((event: Parameters<typeof reduceFirstSession>[1]) => {
    setSession((current) => reduceFirstSession(current, event));
  }, []);

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
  }

  function openDoor() {
    resetDoorFields();
    dispatch({ type: "openDoor" });
  }

  function closeDoor() {
    resetDoorFields();
    dispatch({ type: "closeDoor" });
  }

  function handleSubmitEmail() {
    // Return on the e-mail field is not blocked by the disabled button.
    if (socialBusy !== null) {
      return;
    }
    if (!isValidEmail(email)) {
      setEmailError(DOOR_EMAIL_INVALID);
      return;
    }
    setEmailError(null);
    dispatch({ type: "submitIdentity", method: "email" });
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
        <CodeStub onBack={() => dispatch({ type: "backFromCode" })} />
      ) : null}
      <DoorSheet
        visible={session.place === "door"}
        email={email}
        emailError={emailError}
        showThrottleBanner={showThrottleBanner}
        socialBusy={socialBusy}
        onClose={closeDoor}
        onEmailChange={(value) => {
          setEmail(value);
          setEmailError(null);
        }}
        onSubmit={handleSubmitEmail}
        onSocial={(provider) => {
          void handleSocial(provider);
        }}
      />
    </>
  );
}
