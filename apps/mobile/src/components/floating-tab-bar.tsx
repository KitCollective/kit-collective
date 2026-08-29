import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useRouter, useSegments } from "expo-router";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
};

type TabPlace = "collection" | "search" | "wishlist" | "profile";

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
  wishlist: { icon: "heart-outline", iconActive: "heart", label: "Ønske" },
  profile: { icon: "person-outline", iconActive: "person", label: "Profil" },
};

function isTabPlace(name: string): name is TabPlace {
  switch (name) {
    case "collection":
    case "search":
    case "wishlist":
    case "profile":
      return true;
    default:
      return false;
  }
}

export function FloatingTabBar({ state, navigation }: FloatingTabBarProps) {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const activeRoute = state.routes[state.index]?.name ?? "collection";

  const hideForProfileDrill =
    segments.length > 2 && segments[0] === "(tabs)" && segments[1] === "profile";

  if (activeRoute === "add" || hideForProfileDrill) {
    return null;
  }

  const activePlace = isTabPlace(activeRoute) ? activeRoute : null;

  const navigatePlace = (place: TabPlace) => {
    navigation.navigate(place);
  };

  const startCapture = () => {
    router.push("/(tabs)/add");
  };

  const renderSlot = (place: TabPlace) => {
    const config = PLACE_CONFIG[place];
    const isActive = activePlace === place;

    return (
      <Pressable
        key={place}
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive }}
        accessibilityLabel={config.label}
        onPress={() => navigatePlace(place)}
        style={styles.slot}
      >
        <Ionicons
          name={isActive ? config.iconActive : config.icon}
          size={24}
          color={isActive ? theme.contentPrimary : theme.contentMuted}
        />
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
      {renderSlot("wishlist")}
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
