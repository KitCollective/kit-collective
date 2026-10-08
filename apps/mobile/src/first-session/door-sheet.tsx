import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { requestPasswordReset } from "@/api/identity";
import { resolveAuthErrorFeedback } from "@/auth/auth-error-feedback";
import { project, rubberband } from "@/components/gesture-physics";
import { Sheet, useSheetScroll } from "@/components/sheet";
import {
  DOOR_LOGIN_SEGMENT,
  DOOR_REGISTER_SEGMENT,
  type DoorMode,
  type DoorSocialProvider,
  doorTitle,
  FORGOT_PASSWORD_TITLE,
} from "@/first-session/door-copy";
import { AuthFace, ForgotPasswordFace } from "@/first-session/door-faces";
import { useTypography } from "@/theme/brand-fonts";
import { motion, space } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

export type { DoorMode, DoorSocialProvider } from "@/first-session/door-copy";

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

const FACE_SLIDE = 48;
const SWIPE_ACTIVATE = 14;
const SWIPE_COMMIT_FRACTION = 0.3;

type DoorFace = "login" | "register" | "forgot";
const FACE_ORDER: Record<DoorFace, number> = { login: 0, register: 1, forgot: 2 };

function enterDirection(prev: DoorFace, next: DoorFace): 1 | -1 {
  return FACE_ORDER[next] > FACE_ORDER[prev] ? 1 : -1;
}

type DoorSheetProps = {
  visible: boolean;
  mode: DoorMode;
  email: string;
  password: string;
  passwordRepeat: string;
  error: string | null;
  showThrottleBanner: boolean;
  loading: boolean;
  socialBusy: DoorSocialProvider | null;
  onClose: () => void;
  onSwapMode: () => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onPasswordRepeatChange: (value: string) => void;
  onSubmit: () => void;
  onSocial: (provider: DoorSocialProvider) => void;
};

export function DoorSheet({
  visible,
  mode,
  email,
  password,
  passwordRepeat,
  error,
  showThrottleBanner,
  loading,
  socialBusy,
  onClose,
  onSwapMode,
  onEmailChange,
  onPasswordChange,
  onPasswordRepeatChange,
  onSubmit,
  onSocial,
}: DoorSheetProps) {
  const reduceMotion = useReduceMotion();
  const busy = loading || socialBusy !== null;

  const [page, setPage] = useState<"auth" | "forgot">("auth");
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetThrottle, setResetThrottle] = useState(false);

  const onForgot = page === "forgot";

  useEffect(() => {
    if (!visible) {
      setPage("auth");
      setResetEmail("");
      setResetLoading(false);
      setResetDone(false);
      setResetError(null);
      setResetThrottle(false);
    }
  }, [visible]);

  function handleSelectMode(next: DoorMode) {
    if (next !== mode) {
      onSwapMode();
    }
  }

  function openForgot() {
    setResetEmail(email);
    setResetError(null);
    setResetDone(false);
    setResetThrottle(false);
    setPage("forgot");
  }

  function backToAuth() {
    setResetError(null);
    setResetThrottle(false);
    setPage("auth");
  }

  async function handleResetSubmit() {
    setResetError(null);
    setResetThrottle(false);
    if (resetEmail.trim().length === 0) {
      setResetError("Skriv din e-mail");
      return;
    }
    setResetLoading(true);
    try {
      await requestPasswordReset(resetEmail.trim());
      setResetDone(true);
    } catch (caught) {
      const feedback = resolveAuthErrorFeedback(caught, "Kunne ikke sende nulstilling");
      setResetError(feedback.fieldError);
      setResetThrottle(feedback.showThrottleBanner);
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      variant="door"
      title={onForgot ? FORGOT_PASSWORD_TITLE : doorTitle(mode)}
      titleContent={
        onForgot ? undefined : (
          <DoorModeSwitcher mode={mode} disabled={busy} onSelect={handleSelectMode} />
        )
      }
      onBack={onForgot ? backToAuth : undefined}
      onDismiss={onClose}
    >
      <DoorSheetBody page={page} mode={mode} reduceMotion={reduceMotion} onSwapMode={onSwapMode}>
        {onForgot ? (
          <ForgotPasswordFace
            email={resetEmail}
            loading={resetLoading}
            done={resetDone}
            error={resetError}
            showThrottleBanner={resetThrottle}
            onEmailChange={setResetEmail}
            onSubmit={() => {
              void handleResetSubmit();
            }}
          />
        ) : (
          <AuthFace
            mode={mode}
            email={email}
            password={password}
            passwordRepeat={passwordRepeat}
            error={error}
            showThrottleBanner={showThrottleBanner}
            loading={loading}
            socialBusy={socialBusy}
            busy={busy}
            onEmailChange={onEmailChange}
            onPasswordChange={onPasswordChange}
            onPasswordRepeatChange={onPasswordRepeatChange}
            onSubmit={onSubmit}
            onSocial={onSocial}
            onForgotPassword={openForgot}
            onSwapMode={onSwapMode}
          />
        )}
      </DoorSheetBody>
    </Sheet>
  );
}

function DoorSheetBody({
  page,
  mode,
  reduceMotion,
  onSwapMode,
  children,
}: {
  page: "auth" | "forgot";
  mode: DoorMode;
  reduceMotion: boolean;
  onSwapMode: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const sheetScroll = useSheetScroll();
  const onForgot = page === "forgot";
  const isRegister = mode === "register";
  const face: DoorFace = onForgot ? "forgot" : mode;

  const faceX = useSharedValue(0);
  const faceOpacity = useSharedValue(1);
  const dragStart = useSharedValue(0);
  const bodyWidth = useSharedValue(Dimensions.get("window").width);
  const prevFaceRef = useRef<DoorFace>(face);

  useEffect(() => {
    const prev = prevFaceRef.current;
    if (prev === face) {
      return;
    }
    const direction = enterDirection(prev, face);
    prevFaceRef.current = face;

    if (reduceMotion) {
      faceX.set(0);
      faceOpacity.set(0);
      faceOpacity.set(withTiming(1, { duration: motion.fast, easing: EASE_OUT }));
      return;
    }
    faceX.set(direction * FACE_SLIDE);
    faceOpacity.set(0);
    faceX.set(withTiming(0, { duration: motion.base, easing: EASE_OUT }));
    faceOpacity.set(withTiming(1, { duration: motion.base, easing: EASE_OUT }));
  }, [face, reduceMotion, faceOpacity, faceX]);

  const modeSwipe = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!reduceMotion && page === "auth")
        .maxPointers(1)
        .activeOffsetX([-SWIPE_ACTIVATE, SWIPE_ACTIVATE])
        .failOffsetY([-SWIPE_ACTIVATE, SWIPE_ACTIVATE])
        .onStart(() => {
          dragStart.set(faceX.get());
        })
        .onUpdate((event) => {
          const raw = dragStart.get() + event.translationX;
          const allowed = isRegister ? Math.max(0, raw) : Math.min(0, raw);
          const resisted = raw - allowed;
          faceX.set(allowed + rubberband(resisted, bodyWidth.get()));
          faceOpacity.set(
            interpolate(Math.abs(faceX.get()), [0, bodyWidth.get()], [1, 0], Extrapolation.CLAMP),
          );
        })
        .onEnd((event) => {
          const width = bodyWidth.get();
          const projected = faceX.get() + project(event.velocityX);
          const commit = isRegister
            ? projected > width * SWIPE_COMMIT_FRACTION
            : projected < -width * SWIPE_COMMIT_FRACTION;
          if (commit) {
            const target = isRegister ? width : -width;
            faceOpacity.set(withTiming(0, { duration: motion.fast, easing: EASE_OUT }));
            faceX.set(
              withTiming(target, { duration: motion.fast, easing: EASE_OUT }, (finished) => {
                if (finished) {
                  scheduleOnRN(onSwapMode);
                }
              }),
            );
            return;
          }
          faceX.set(
            withSpring(0, { duration: motion.base, dampingRatio: 0.8, velocity: event.velocityX }),
          );
          faceOpacity.set(withTiming(1, { duration: motion.base, easing: EASE_OUT }));
        }),
    [reduceMotion, page, isRegister, onSwapMode, bodyWidth, dragStart, faceOpacity, faceX],
  );

  const faceStyle = useAnimatedStyle(() => ({
    opacity: faceOpacity.get(),
    transform: [{ translateX: reduceMotion ? 0 : faceX.get() }],
  }));

  function onBodyLayout(event: LayoutChangeEvent) {
    const width = event.nativeEvent.layout.width;
    if (width > 0) {
      bodyWidth.set(width);
    }
  }

  const scrollView = (
    <Animated.ScrollView
      onScroll={sheetScroll?.scrollHandler}
      scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.scrollBody,
        { paddingBottom: Math.max(insets.bottom, space.insetMd) },
      ]}
    >
      <GestureDetector gesture={modeSwipe}>
        <Animated.View style={[styles.face, faceStyle]} onLayout={onBodyLayout}>
          {children}
        </Animated.View>
      </GestureDetector>
    </Animated.ScrollView>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.avoider}
    >
      {sheetScroll ? (
        <GestureDetector gesture={sheetScroll.scrollGesture}>{scrollView}</GestureDetector>
      ) : (
        scrollView
      )}
    </KeyboardAvoidingView>
  );
}

function DoorModeSwitcher({
  mode,
  disabled,
  onSelect,
}: {
  mode: DoorMode;
  disabled: boolean;
  onSelect: (mode: DoorMode) => void;
}) {
  const theme = useTheme();
  const typography = useTypography();

  const segments: { mode: DoorMode; label: string }[] = [
    { mode: "login", label: DOOR_LOGIN_SEGMENT },
    { mode: "register", label: DOOR_REGISTER_SEGMENT },
  ];

  return (
    <View style={styles.switcherRow}>
      {segments.map((segment) => {
        const selected = segment.mode === mode;
        return (
          <Pressable
            key={segment.mode}
            accessibilityRole="button"
            accessibilityLabel={segment.label}
            accessibilityState={{ selected }}
            disabled={disabled || selected}
            onPress={() => onSelect(segment.mode)}
            style={({ pressed }) => [styles.switcherSegment, pressed && styles.pressed]}
          >
            <Text
              numberOfLines={1}
              style={[
                typography.title,
                { color: selected ? theme.contentPrimary : theme.contentMuted },
              ]}
            >
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  avoider: {
    flex: 1,
  },
  scrollBody: {
    flexGrow: 1,
    paddingTop: space.gapMd,
  },
  face: {
    flexGrow: 1,
  },
  switcherRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapLg,
  },
  switcherSegment: {
    minHeight: 44,
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.9,
  },
});
