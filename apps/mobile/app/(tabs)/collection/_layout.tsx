import { Stack } from "expo-router";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

export default function CollectionStackLayout() {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: reduceMotion ? "none" : "default",
        contentStyle: { backgroundColor: theme.canvas },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[jerseyId]" />
    </Stack>
  );
}
