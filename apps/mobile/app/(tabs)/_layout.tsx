import { Tabs } from "expo-router";
import { FloatingTabBar } from "@/components/floating-tab-bar";
import { useTheme } from "@/theme/use-theme";

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
        },
        sceneStyle: {
          backgroundColor: theme.canvas,
        },
      }}
    >
      <Tabs.Screen name="collection" options={{ title: "Samling" }} />
      <Tabs.Screen name="search" options={{ title: "Søg" }} />
      <Tabs.Screen name="wishlist" options={{ title: "Ønske" }} />
      <Tabs.Screen name="profile" options={{ title: "Profil" }} />
      <Tabs.Screen name="add" options={{ href: null }} />
    </Tabs>
  );
}
