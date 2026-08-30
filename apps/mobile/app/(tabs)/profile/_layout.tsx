import { Stack } from "expo-router";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

export default function ProfileLayout() {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: reduceMotion ? "none" : "fade",
        contentStyle: { backgroundColor: theme.fillSecondary },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="edit" />
      <Stack.Screen name="min-lokation" />
      <Stack.Screen name="favoritter" />
      <Stack.Screen name="indstillinger" />
      <Stack.Screen name="kontoindstillinger" />
      <Stack.Screen name="skift-adgangskode" />
      <Stack.Screen name="skift-email" />
      <Stack.Screen name="push-notifikationer" />
      <Stack.Screen name="email-notifikationer" />
      <Stack.Screen name="sprog" />
      <Stack.Screen name="moerk-tilstand" />
      <Stack.Screen name="privatlivsindstillinger" />
      <Stack.Screen name="administrer-kontodata" />
      <Stack.Screen name="cookie-indstillinger" />
    </Stack>
  );
}
