import { useFocusEffect } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useCallback, useEffect, useState } from "react";
import { DynamicColorIOS, Platform } from "react-native";
import { fetchConversations } from "@/api/conversations";
import { useAuth } from "@/auth/AuthProvider";
import { useTabBarIconSrc } from "@/components/tab-bar-icon";
import { InboxChromeProvider } from "@/inbox/inbox-chrome";
import "@/navigation/place-home-warmup";
import { clearPlaceOverviews } from "@/navigation/place-overview-cache";
import {
  prefetchPlaceOverviews,
  resetPlaceOverviewPrefetch,
} from "@/navigation/place-overview-prefetch";
import { PlaceSwipeProvider } from "@/navigation/place-swipe-context";
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

  useEffect(() => {
    if (!accessToken) {
      clearPlaceOverviews();
      resetPlaceOverviewPrefetch();
      return;
    }
    void prefetchPlaceOverviews(accessToken);
  }, [accessToken]);

  // Liquid Glass has no JS color-scheme callback, so iOS resolves each token
  // natively via DynamicColor; Android takes the already-resolved token.
  const light = getThemeColors("light");
  const dark = getThemeColors("dark");
  const resolved = getThemeColors(appearance?.effectiveScheme === "dark" ? "dark" : "light");
  const nativeTabColor = (token: keyof ThemeColors) =>
    Platform.OS === "ios"
      ? DynamicColorIOS({ light: light[token], dark: dark[token] })
      : resolved[token];
  const canvas = nativeTabColor("canvas");
  const tint = nativeTabColor("contentPrimary");
  const tabContentStyle = { backgroundColor: canvas };
  const label = nativeTabColor("contentSecondary");
  const collectionIcon = useTabBarIconSrc("grid-outline", "grid");
  const inboxIcon = useTabBarIconSrc("mail-outline", "mail");
  const searchIcon = useTabBarIconSrc("search");
  const wishlistIcon = useTabBarIconSrc("bookmark-outline", "bookmark");
  const profileIcon = useTabBarIconSrc("person-outline", "person");

  return (
    <InboxChromeProvider refreshUnreadCount={refreshUnreadCount}>
      <PlaceSwipeProvider>
        <NativeTabs tintColor={tint} labelStyle={{ color: label }}>
          <NativeTabs.Trigger
            name="collection"
            disableAutomaticContentInsets
            contentStyle={tabContentStyle}
          >
            <NativeTabs.Trigger.Label>Samling</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon renderingMode="template" src={collectionIcon} />
          </NativeTabs.Trigger>

          <NativeTabs.Trigger
            name="inbox"
            disableAutomaticContentInsets
            contentStyle={tabContentStyle}
          >
            <NativeTabs.Trigger.Label>Indbakke</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon renderingMode="template" src={inboxIcon} />
            {unreadCount > 0 ? (
              <NativeTabs.Trigger.Badge>{String(unreadCount)}</NativeTabs.Trigger.Badge>
            ) : null}
          </NativeTabs.Trigger>

          <NativeTabs.Trigger
            name="search"
            disableAutomaticContentInsets
            contentStyle={tabContentStyle}
          >
            <NativeTabs.Trigger.Label>Søg</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon renderingMode="template" src={searchIcon} />
          </NativeTabs.Trigger>

          <NativeTabs.Trigger
            name="wishlist"
            disableAutomaticContentInsets
            contentStyle={tabContentStyle}
          >
            <NativeTabs.Trigger.Label>Ønsker</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon renderingMode="template" src={wishlistIcon} />
          </NativeTabs.Trigger>

          <NativeTabs.Trigger
            name="profile"
            disableAutomaticContentInsets
            contentStyle={tabContentStyle}
          >
            <NativeTabs.Trigger.Label>Profil</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon renderingMode="template" src={profileIcon} />
          </NativeTabs.Trigger>
        </NativeTabs>
      </PlaceSwipeProvider>
    </InboxChromeProvider>
  );
}
