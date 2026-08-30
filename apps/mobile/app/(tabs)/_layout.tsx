import { Tabs, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { fetchConversations } from "@/api/conversations";
import { useAuth } from "@/auth/AuthProvider";
import { FloatingTabBar } from "@/components/floating-tab-bar";
import { InboxChromeProvider } from "@/inbox/inbox-chrome";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

export default function TabsLayout() {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const { accessToken } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnreadCount = useCallback(async () => {
    if (!accessToken) {
      setUnreadCount(0);
      return;
    }

    try {
      const response = await fetchConversations(accessToken);
      setUnreadCount(response.unreadCount);
    } catch {
      setUnreadCount(0);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      void refreshUnreadCount();
    }, [refreshUnreadCount]),
  );

  return (
    <InboxChromeProvider refreshUnreadCount={refreshUnreadCount}>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} unreadCount={unreadCount} />}
        screenOptions={{
          headerShown: false,
          animation: reduceMotion ? "none" : "fade",
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
        <Tabs.Screen name="inbox" options={{ title: "Indbakke" }} />
        <Tabs.Screen name="profile" options={{ title: "Profil" }} />
        <Tabs.Screen name="add" options={{ href: null }} />
      </Tabs>
    </InboxChromeProvider>
  );
}
