import { useFocusEffect } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useCallback, useState } from "react";
import { DynamicColorIOS, Platform } from "react-native";
import { fetchConversations } from "@/api/conversations";
import { useAuth } from "@/auth/AuthProvider";
import { InboxChromeProvider } from "@/inbox/inbox-chrome";
import { useAppearanceOptional } from "@/theme/appearance";
import { getThemeColors, type ThemeColors } from "@/theme/tokens";

/**
 * Bottom navigation (docs/design-system.md → Tab bar). Five native tabs so iOS 26
 * renders the system Liquid Glass bar. Order: Samling, Indbakke, Søg (center),
 * Ønsker, Profil. Capture is not a tab — it is the header action on Samling.
 */
export default function TabsLayout() {
  const { accessToken } = useAuth();
  const appearance = useAppearanceOptional();
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

  // Liquid Glass has no JS color-scheme callback, so iOS resolves each token
  // natively via DynamicColor; Android takes the already-resolved token.
  const light = getThemeColors("light");
  const dark = getThemeColors("dark");
  const resolved = getThemeColors(appearance?.effectiveScheme === "dark" ? "dark" : "light");
  const nativeTabColor = (token: keyof ThemeColors) =>
    Platform.OS === "ios"
      ? DynamicColorIOS({ light: light[token], dark: dark[token] })
      : resolved[token];
  const tint = nativeTabColor("contentPrimary");
  const label = nativeTabColor("contentSecondary");

  return (
    <InboxChromeProvider refreshUnreadCount={refreshUnreadCount}>
      <NativeTabs tintColor={tint} labelStyle={{ color: label }}>
        <NativeTabs.Trigger name="collection">
          <NativeTabs.Trigger.Label>Samling</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }} md="grid_view" />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="inbox">
          <NativeTabs.Trigger.Label>Indbakke</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: "envelope", selected: "envelope.fill" }} md="mail" />
          {unreadCount > 0 ? (
            <NativeTabs.Trigger.Badge>{String(unreadCount)}</NativeTabs.Trigger.Badge>
          ) : null}
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="search">
          <NativeTabs.Trigger.Label>Søg</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="wishlist">
          <NativeTabs.Trigger.Label>Ønsker</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: "bookmark", selected: "bookmark.fill" }} md="bookmark" />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="profile">
          <NativeTabs.Trigger.Label>Profil</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: "person", selected: "person.fill" }} md="person" />
        </NativeTabs.Trigger>
      </NativeTabs>
    </InboxChromeProvider>
  );
}
