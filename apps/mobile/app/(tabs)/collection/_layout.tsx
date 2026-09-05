import { Stack } from "expo-router";
import { stackScreenMotion } from "@/navigation/stack-motion";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

export default function CollectionStackLayout() {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: stackScreenMotion(reduceMotion),
        contentStyle: { backgroundColor: theme.canvas },
      }}
    >
      <Stack.Screen name="index" options={{ animation: "none" }} />
      <Stack.Screen name="[jerseyId]" />
    </Stack>
  );
}
