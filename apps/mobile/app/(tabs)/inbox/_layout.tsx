import { Stack } from "expo-router";
import { stackRouteMotion } from "@/navigation/stack-motion";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

export default function InboxLayout() {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  return (
    <Stack
      screenOptions={({ route }) => ({
        headerShown: false,
        animation: stackRouteMotion(route.name, reduceMotion),
        contentStyle: { backgroundColor: theme.canvas },
      })}
    />
  );
}
