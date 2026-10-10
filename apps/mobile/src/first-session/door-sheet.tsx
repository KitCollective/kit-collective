import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { Sheet, useSheetScroll } from "@/components/sheet";
import { toastConfig } from "@/components/toast-config";
import { DOOR_TITLE, type DoorSocialProvider } from "@/first-session/door-copy";
import { DoorFace } from "@/first-session/door-faces";
import { space } from "@/theme/tokens";

export type { DoorSocialProvider } from "@/first-session/door-copy";

type DoorSheetProps = {
  visible: boolean;
  email: string;
  emailError: string | null;
  showThrottleBanner: boolean;
  socialBusy: DoorSocialProvider | null;
  emailBusy: boolean;
  onClose: () => void;
  onEmailChange: (value: string) => void;
  onSubmit: () => void;
  onSocial: (provider: DoorSocialProvider) => void;
};

export function DoorSheet({
  visible,
  email,
  emailError,
  showThrottleBanner,
  socialBusy,
  emailBusy,
  onClose,
  onEmailChange,
  onSubmit,
  onSocial,
}: DoorSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Sheet visible={visible} variant="door" title={DOOR_TITLE} onDismiss={onClose}>
      <DoorSheetBody>
        <DoorFace
          email={email}
          emailError={emailError}
          showThrottleBanner={showThrottleBanner}
          socialBusy={socialBusy}
          emailBusy={emailBusy}
          onEmailChange={onEmailChange}
          onSubmit={onSubmit}
          onSocial={onSocial}
        />
      </DoorSheetBody>
      {/*
        The Sheet is a native Modal the root <Toast> cannot cover. A host here lets the
        library's ref-priority stack route the failed-sign-in toast to this surface.
        docs/design-system.md → Toast.
      */}
      {visible ? (
        <Toast
          config={toastConfig}
          position="bottom"
          bottomOffset={insets.bottom + space.insetMd}
        />
      ) : null}
    </Sheet>
  );
}

function DoorSheetBody({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const sheetScroll = useSheetScroll();

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
      {children}
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

const styles = StyleSheet.create({
  avoider: {
    flex: 1,
  },
  scrollBody: {
    flexGrow: 1,
    paddingTop: space.gapMd,
  },
});
