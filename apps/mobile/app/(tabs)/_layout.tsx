import { Tabs } from "expo-router";
import { Pressable, Text } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { colors } from "@/theme/tokens";

export default function TabsLayout() {
  const { signOut } = useAuth();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: {
          fontSize: 14,
          fontWeight: "600",
        },
        headerRight: () => (
          <Pressable
            accessibilityRole="button"
            onPress={() => void signOut()}
            style={{ paddingHorizontal: 16 }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>Log ud</Text>
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen
        name="collection"
        options={{
          title: "Samling",
          tabBarLabel: "Samling",
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: "Tilføj",
          tabBarLabel: "Tilføj",
        }}
      />
    </Tabs>
  );
}
