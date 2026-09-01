import { Redirect, Stack, useSegments } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { LoadingScreen } from "../_layout";

export default function AuthLayout() {
  const { user, isLoading } = useAuth();
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
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="verify" />
      <Stack.Screen name="reset" />
      <Stack.Screen name="reset-complete" />
    </Stack>
  );
}
