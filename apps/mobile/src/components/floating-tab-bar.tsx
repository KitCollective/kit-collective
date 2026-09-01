import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useRouter, useSegments } from "expo-router";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { useInboxChromeOptional } from "@/inbox/inbox-chrome";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space, withAlpha } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

const TAB_BAR_SURFACE_ALPHA = {
  fill: 0.72,
  blurOverlay: 0.5,
} as const;

type TabBarNavigation = {
  navigate: (name: string) => void;
};

type FloatingTabBarProps = {
  state: {
    index: number;
    routes: { name: string; key: string }[];
  };
  navigation: TabBarNavigation;
  unreadCount?: number;
};

type TabPlace = "collection" | "search" | "inbox" | "profile";

const PLACE_CONFIG: Record<
  TabPlace,
  {
    icon: keyof typeof Ionicons.glyphMap;
    iconActive: keyof typeof Ionicons.glyphMap;
    label: string;
  }
> = {
  collection: { icon: "home-outline", iconActive: "home", label: "Samling" },
  search: { icon: "compass-outline", iconActive: "compass", label: "Søg" },
  inbox: { icon: "mail-outline", iconActive: "mail", label: "Indbakke" },
  profile: { icon: "person-outline", iconActive: "person", label: "Profil" },
};

function isTabPlace(name: string): name is TabPlace {
  switch (name) {
    case "collection":
    case "search":
    case "inbox":
    case "profile":
      return true;
    default:
      return false;
  }
}

function inboxAccessibilityLabel(unreadCount: number): string {
  if (unreadCount > 0) {
    return `Indbakke, ${unreadCount} ulæste`;
  }
  return "Indbakke";
}

export function FloatingTabBar({ state, navigation, unreadCount = 0 }: FloatingTabBarProps) {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const typography = useTypography();
  const { requestPremiumAccess } = useAuth();

  const activeRoute = state.routes[state.index]?.name ?? "collection";

  const inboxChrome = useInboxChromeOptional();
  const hideForProfileDrill = segments.length > 2 && segments.at(1) === "profile";
  const hideForSearchDrill = segments.length > 2 && segments.at(1) === "search";
  const hideForConversationRoute =
    segments.length > 2 && segments.at(1) === "inbox" && segments.at(2) !== undefined;
  const hideForWideConversation = inboxChrome?.conversationVisible ?? false;

  if (
    activeRoute === "add" ||
    hideForProfileDrill ||
    hideForSearchDrill ||
    hideForConversationRoute ||
    hideForWideConversation
  ) {
    return null;
  }

  const activePlace = isTabPlace(activeRoute) ? activeRoute : null;

  const navigatePlace = (place: TabPlace) => {
    navigation.navigate(place);
  };

  const startCapture = () => {
    void (async () => {
      const granted = await requestPremiumAccess();
      if (granted) {
        router.push("/(tabs)/add");
      }
    })();
  };

  const renderSlot = (place: TabPlace) => {
    const config = PLACE_CONFIG[place];
    const isActive = activePlace === place;
    const showUnreadBadge = place === "inbox" && unreadCount > 0;
    const accessibilityLabel =
      place === "inbox" ? inboxAccessibilityLabel(unreadCount) : config.label;

    return (
      <Pressable
        key={place}
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive }}
        accessibilityLabel={accessibilityLabel}
        onPress={() => navigatePlace(place)}
        style={styles.slot}
      >
        <View style={styles.iconWrap}>
          <Ionicons
            name={isActive ? config.iconActive : config.icon}
            size={24}
            color={isActive ? theme.contentPrimary : theme.contentMuted}
          />
          {showUnreadBadge ? (
            <View style={[styles.badge, { backgroundColor: theme.fillPrimary }]}>
              <Text style={[typography.mono, { color: theme.contentInverse }]}>{unreadCount}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const pillBorderColor = theme.borderSubtle;
  const pillShadowColor = theme.contentPrimary;
  const pillFillColor = withAlpha(theme.surface, TAB_BAR_SURFACE_ALPHA.fill);
  const pillBlurOverlayColor = withAlpha(theme.surface, TAB_BAR_SURFACE_ALPHA.blurOverlay);

  const pillContent = (
    <View style={[styles.pillInner, { borderColor: pillBorderColor }]}>
      {renderSlot("collection")}
      {renderSlot("search")}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Tilføj trøje"
        onPress={startCapture}
        style={styles.plusSlot}
      >
        <View style={[styles.plusCircle, { backgroundColor: theme.fillPrimary }]}>
          <Ionicons name="add" size={26} color={theme.contentInverse} />
        </View>
      </Pressable>
      {renderSlot("inbox")}
      {renderSlot("profile")}
    </View>
  );

  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { paddingBottom: space.insetLg + space.insetSm + insets.bottom }]}
    >
      {Platform.OS === "ios" ? (
        <BlurView
          intensity={22}
          tint="default"
          style={[
            styles.pill,
            {
              backgroundColor: pillBlurOverlayColor,
              borderColor: pillBorderColor,
              shadowColor: pillShadowColor,
            },
          ]}
        >
          {pillContent}
        </BlurView>
      ) : (
        <View
          style={[
            styles.pill,
            {
              backgroundColor: pillFillColor,
              borderColor: pillBorderColor,
              shadowColor: pillShadowColor,
            },
          ]}
        >
          {pillContent}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: space.insetLg,
    right: space.insetLg,
    bottom: 0,
  },
  pill: {
    borderRadius: radius.pill,
    overflow: "hidden",
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 4,
  },
  pillInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    height: space.insetLg * 2 + space.insetMd,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 4,
  },
  slot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    minWidth: 48,
  },
  iconWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  plusSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    minHeight: 48,
    minWidth: 48,
    marginTop: -12,
  },
  plusCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
});
