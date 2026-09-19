import { Redirect, Stack, useSegments } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { stackScreenMotion } from "@/navigation/stack-motion";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { LoadingScreen } from "../_layout";

export default function AuthLayout() {
  const { user, isLoading } = useAuth();
  const reduceMotion = useReduceMotion();
  const segments = useSegments();
  const leaf = segments[segments.length - 1];
  const allowWhileSignedIn = leaf === "verify";

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (user && !allowWhileSignedIn) {
    return <Redirect href="/(tabs)/collection" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false, animation: stackScreenMotion(reduceMotion) }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="verify" />
      <Stack.Screen name="reset" />
      <Stack.Screen name="reset-complete" />
    </Stack>
  );
}
