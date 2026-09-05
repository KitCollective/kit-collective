import { Stack } from "expo-router";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

export default function CaptureFlowLayout() {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();

  return (
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
      <Stack.Screen name="confirm" options={{ headerShown: false }} />
    </Stack>
  );
}
