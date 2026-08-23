import { Stack } from "expo-router";
import { useTheme } from "@/theme/use-theme";

export default function AddFlowLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.canvas },
        headerTintColor: theme.contentPrimary,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="capture" options={{ headerShown: false, animation: "fade" }} />
      <Stack.Screen name="confirm" options={{ title: "Bekræft og gem" }} />
    </Stack>
  );
}
