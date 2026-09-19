import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { toastConfig } from "@/components/toast-config";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

export default function CaptureFlowLayout() {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();

  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.canvas },
          headerTintColor: theme.contentPrimary,
        }}
      >
        <Stack.Screen
          name="capture"
          options={{ headerShown: false, animation: reduceMotion ? "none" : "fade" }}
        />
        <Stack.Screen
          name="loading"
          options={{ headerShown: false, animation: reduceMotion ? "none" : "fade" }}
        />
        <Stack.Screen name="confirm" options={{ headerShown: false }} />
        <Stack.Screen name="confirm-data" options={{ headerShown: false }} />
        <Stack.Screen name="confirm-details" options={{ headerShown: false }} />
      </Stack>
      {/*
        The (capture) group is a fullScreenModal — a separate native surface the root
        <Toast> can't cover. Mounting a host here lets react-native-toast-message's
        ref-priority stack route save-failure toasts to this (topmost) surface. The
        bottomOffset clears the confirm Gem dock. docs/design-system.md → Toast.
      */}
      <Toast config={toastConfig} position="bottom" bottomOffset={insets.bottom + 96} />
    </>
  );
}
