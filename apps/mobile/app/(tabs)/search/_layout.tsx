import { Stack } from "expo-router";
import { stackRouteMotion } from "@/navigation/stack-motion";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

export default function SearchLayout() {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  return (
    <Stack
      screenOptions={({ route }) => ({
        headerShown: false,
        animation: stackRouteMotion(route.name, reduceMotion),
        contentStyle: { backgroundColor: theme.canvas },
      })}
    >
      {/* Declared first: the first declared screen is the Stack's initial route. */}
      <Stack.Screen name="index" />
      {/*
        A foreign UserJersey hides the Tab bar (docs/design-system.md → Foreign UserJersey detail).
        The bar is hidden the way the capture flow hides it: the route is presented as a full-screen
        modal (Tab bar → Hide behavior), not with NativeTabs `hidden`, which remounts the navigator.
      */}
      <Stack.Screen name="[jerseyId]" options={{ presentation: "fullScreenModal" }} />
    </Stack>
  );
}
