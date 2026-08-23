import { Stack } from "expo-router";
import { useTheme } from "@/theme/use-theme";

export default function CollectionStackLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.canvas },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[jerseyId]" />
    </Stack>
  );
}
