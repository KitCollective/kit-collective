import { Tabs } from "expo-router";
import { Pressable, Text } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { color, space, type } from "@/theme/tokens";

export default function TabsLayout() {
  const { signOut } = useAuth();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: color.canvas },
        headerTintColor: color.contentPrimary,
        tabBarActiveTintColor: color.contentPrimary,
        tabBarInactiveTintColor: color.contentMuted,
        tabBarStyle: {
          backgroundColor: color.canvas,
          borderTopColor: color.borderSubtle,
        },
        tabBarLabelStyle: {
          fontSize: type.caption.fontSize,
          fontWeight: type.label.fontWeight,
        },
        headerRight: () => (
          <Pressable
            accessibilityRole="button"
            onPress={() => void signOut()}
            style={{ paddingHorizontal: space.insetMd }}
          >
            <Text style={{ color: color.contentMuted, fontSize: type.caption.fontSize }}>
              Log ud
            </Text>
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
