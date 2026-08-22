import { Stack } from "expo-router";
import { color } from "@/theme/tokens";

export default function AddFlowLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: color.canvas },
        headerTintColor: color.contentPrimary,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="capture" options={{ headerShown: false, animation: "fade" }} />
      <Stack.Screen name="confirm" options={{ title: "Bekræft og gem" }} />
    </Stack>
  );
}
