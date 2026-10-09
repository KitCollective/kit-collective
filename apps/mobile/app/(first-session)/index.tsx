import type { IdentityLinkedProvider } from "@kit/api-contract";
import { Redirect } from "expo-router";
import { useCallback, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { resolveAuthErrorFeedback } from "@/auth/auth-error-feedback";
import { FirstSessionAnalysingScreen } from "@/first-session/analysing-screen";
import { FirstSessionChooserScreen } from "@/first-session/chooser-screen";
import { exampleById } from "@/first-session/demo";
import { DemoScreen } from "@/first-session/demo-screen";
import { DoorSheet } from "@/first-session/door";
import { JerseyDetailsScreen } from "@/first-session/jersey-details-screen";
import {
  createFirstSession,
  firstSessionBackdrop,
  reduceFirstSession,
} from "@/first-session/session";
import { type ExampleOrigins, WelcomeScreen } from "@/first-session/welcome-screen";
import { LoadingScreen } from "../_layout";

export default function FirstSessionHost() {
  const { user, isLoading, signIn, signUp, signInSocial } = useAuth();
  const [session, setSession] = useState(() => createFirstSession({ signedIn: false }));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showThrottleBanner, setShowThrottleBanner] = useState(false);
  const [loading, setLoading] = useState(false);
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
    return (
      <Redirect
        href={
          session.resultCollection
            ? "/(tabs)/collection?firstSessionResult=1"
            : "/(tabs)/collection"
        }
      />
    );
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
    setPassword("");
    setPasswordRepeat("");
    setError(null);
    setShowThrottleBanner(false);
  }

  function openDoor(mode: "login" | "register") {
    resetDoorFields();
    dispatch({ type: "openDoor", mode });
  }

  function closeDoor() {
    resetDoorFields();
    dispatch({ type: "closeDoor" });
  }

  async function handleSubmitEmail() {
    const mode = session.doorMode ?? "login";
    setError(null);
    setShowThrottleBanner(false);

    if (email.trim().length === 0) {
      setError("Skriv din e-mail");
      return;
    }

    if (mode === "register") {
      if (password.length < 8) {
        setError("Adgangskoden skal være mindst 8 tegn");
        return;
      }
      if (password !== passwordRepeat) {
        setError("Adgangskoderne matcher ikke");
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === "register") {
        await signUp(email.trim(), password);
        dispatch({
          type: "submitIdentity",
          method: "password",
          kind: "register",
        });
      } else {
        await signIn(email.trim(), password);
        dispatch({
          type: "submitIdentity",
          method: "password",
          kind: "login",
        });
      }
    } catch (caught) {
      const feedback = resolveAuthErrorFeedback(
        caught,
        mode === "register"
          ? "Kunne ikke oprette konto. Tjek e-mail og adgangskode."
          : "Forkert e-mail eller adgangskode",
      );
      setError(feedback.fieldError);
      setShowThrottleBanner(feedback.showThrottleBanner);
    } finally {
      setLoading(false);
    }
  }

  async function handleSocial(provider: IdentityLinkedProvider) {
    const kind = session.doorMode ?? "login";
    setError(null);
    setShowThrottleBanner(false);
    setSocialBusy(provider);
    try {
      await signInSocial(provider);
      dispatch({
        type: "submitIdentity",
        method: "social",
        kind,
      });
    } catch (caught) {
      const feedback = resolveAuthErrorFeedback(caught, "Kunne ikke logge ind");
      setError(feedback.fieldError);
      setShowThrottleBanner(feedback.showThrottleBanner);
    } finally {
      setSocialBusy(null);
    }
  }

  const doorMode = session.doorMode ?? "login";
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
          onHaveAccount={() => openDoor("login")}
        />
      ) : null}
      {backdrop === "demo" && session.demoExampleId ? (
        <DemoScreen
          example={exampleById(session.demoExampleId)}
          origins={demoOrigins}
          onStart={() => openDoor("register")}
          onTryAnother={() => {
            dispatch({ type: "demoTryAnother" });
          }}
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
      <DoorSheet
        visible={session.place === "door"}
        mode={doorMode}
        email={email}
        password={password}
        passwordRepeat={passwordRepeat}
        error={error}
        showThrottleBanner={showThrottleBanner}
        loading={loading}
        socialBusy={socialBusy}
        onClose={closeDoor}
        onSwapMode={() => {
          const next = doorMode === "login" ? "register" : "login";
          resetDoorFields();
          if (session.doorOver === "analysing") {
            dispatch({ type: "openDoorFromAnalysing", mode: next });
            return;
          }
          dispatch({ type: "openDoor", mode: next });
        }}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onPasswordRepeatChange={setPasswordRepeat}
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
