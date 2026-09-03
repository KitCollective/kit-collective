import type { IdentityLinkedProvider } from "@kit/api-contract";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { type DoorEmailStep, DoorSheet, VerifyEmailBeat } from "@/first-session/door";
import { DiscoveryShowcaseScreen } from "@/first-session/discovery-showcase";
import { ProfileOnboardingScreen } from "@/first-session/profile-onboarding";
import { createFirstSession, reduceFirstSession } from "@/first-session/session";
import { SplashView } from "@/first-session/splash";
import { LoadingScreen } from "../_layout";

export default function FirstSessionHost() {
  const router = useRouter();
  const { user, isLoading, signIn, signUp, signInSocial } = useAuth();
  const [session, setSession] = useState(() => createFirstSession({ signedIn: false }));
  const [emailStep, setEmailStep] = useState<DoorEmailStep>("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [socialBusy, setSocialBusy] = useState<IdentityLinkedProvider | null>(null);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (user && session.place === "splash") {
    return <Redirect href="/(tabs)/collection" />;
  }

  if (session.place === "collection" || session.place === "tab-shell") {
    return <Redirect href="/(tabs)/collection" />;
  }

  if (session.place === "profile") {
    return (
      <ProfileOnboardingScreen
        onContinue={() => {
          setSession((current) => reduceFirstSession(current, { type: "continueProfile" }));
        }}
      />
    );
  }

  function resetDoorFields() {
    setEmailStep("choose");
    setEmail("");
    setPassword("");
    setPasswordRepeat("");
    setError(null);
  }

  function openDoor(mode: "login" | "register") {
    resetDoorFields();
    setSession((current) => reduceFirstSession(current, { type: "openDoor", mode }));
  }

  function closeDoor() {
    resetDoorFields();
    setSession((current) => reduceFirstSession(current, { type: "closeDoor" }));
  }

  function handleContinueFromSplash() {
    setSession((current) => reduceFirstSession(current, { type: "continueFromSplash" }));
  }

  function handleNextEmail() {
    setError(null);
    if (emailStep === "choose") {
      setEmailStep(1);
      return;
    }
    if (email.trim().length === 0) {
      setError("Skriv din e-mail");
      return;
    }
    setEmailStep(2);
  }

  async function handleSubmitEmail() {
    const mode = session.doorMode ?? "login";
    setError(null);

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
        setSession((current) =>
          reduceFirstSession(current, {
            type: "submitIdentity",
            method: "password",
            kind: "register",
          }),
        );
      } else {
        await signIn(email.trim(), password);
        setSession((current) =>
          reduceFirstSession(current, {
            type: "submitIdentity",
            method: "password",
            kind: "login",
          }),
        );
      }
    } catch {
      setError(
        mode === "register"
          ? "Kunne ikke oprette konto. Tjek e-mail og adgangskode."
          : "Forkert e-mail eller adgangskode",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSocial(provider: IdentityLinkedProvider) {
    const kind = session.doorMode ?? "login";
    setError(null);
    setSocialBusy(provider);
    try {
      await signInSocial(provider);
      setSession((current) =>
        reduceFirstSession(current, {
          type: "submitIdentity",
          method: "social",
          kind,
        }),
      );
    } catch {
      setError("Kunne ikke logge ind");
    } finally {
      setSocialBusy(null);
    }
  }

  function handleDismissVerifyEmail() {
    setSession((current) => reduceFirstSession(current, { type: "dismissVerifyEmail" }));
  }

  const doorMode = session.doorMode ?? "login";
  const showDiscoveryBackdrop =
    session.place === "discovery" || (session.place === "door" && !session.skippedDiscovery);
  const showSplashBackdrop =
    session.place === "splash" || (session.place === "door" && session.skippedDiscovery);

  return (
    <>
      {showDiscoveryBackdrop ? (
        <DiscoveryShowcaseScreen
          onAddFirst={() => {
            // Photos slice wires this action later.
          }}
          onHaveAccount={() => openDoor("login")}
        />
      ) : null}
      {showSplashBackdrop ? (
        <SplashView
          onContinue={handleContinueFromSplash}
          onLogin={() => openDoor("login")}
          onRegister={() => openDoor("register")}
        />
      ) : null}
      <DoorSheet
        visible={session.place === "door"}
        mode={doorMode}
        emailStep={emailStep}
        email={email}
        password={password}
        passwordRepeat={passwordRepeat}
        error={error}
        loading={loading}
        socialBusy={socialBusy}
        onClose={closeDoor}
        onSwapMode={() => {
          const next = doorMode === "login" ? "register" : "login";
          resetDoorFields();
          setSession((current) => reduceFirstSession(current, { type: "openDoor", mode: next }));
        }}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onPasswordRepeatChange={setPasswordRepeat}
        onNextEmail={handleNextEmail}
        onChangeEmail={() => {
          setEmailStep(1);
          setPassword("");
          setPasswordRepeat("");
        }}
        onSubmitEmail={() => {
          void handleSubmitEmail();
        }}
        onSocial={(provider) => {
          void handleSocial(provider);
        }}
        onForgotPassword={() => {
          router.push("/(auth)/reset");
        }}
        onBackStep={() => {
          if (emailStep === 2) {
            setEmailStep(1);
            setPassword("");
            setPasswordRepeat("");
            return;
          }
          if (emailStep === 1) {
            setEmailStep("choose");
          }
        }}
      />
      <VerifyEmailBeat
        visible={session.place === "verify-email"}
        onDismiss={handleDismissVerifyEmail}
      />
    </>
  );
}
