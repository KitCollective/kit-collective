import { formatProfileLocationCaption } from "@kit/domain";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { fetchFavorites } from "@/api/favorites";
import { resolveAvatarUrl } from "@/api/identity";
import { useAuth } from "@/auth/AuthProvider";
import { favoritesMetaLine } from "@/components/favorites-meta";
import { IdentityCard, ListNavigateRow, ProfileSurfaceGroup } from "@/components/profile-ui";
import { ScreenHeader } from "@/components/screen-header";
import { tabBarContentInset } from "@/components/tab-bar-metrics";
import { registerPlaceHome, useIsPlaceHomeLive } from "@/navigation/place-homes";
import { writePlaceOverview } from "@/navigation/place-overview-cache";
import { PlacePagerScreen } from "@/navigation/place-pager-screen";
import { usePlaceOverview } from "@/navigation/use-place-overview";
import { space } from "@/theme/tokens";
import { useStableSafeAreaInsets } from "@/theme/use-stable-safe-area-insets";
import { useTheme } from "@/theme/use-theme";

export default function ProfileHomeScreen() {
  return <PlacePagerScreen place="profile" />;
}

function ProfileHome() {
  const theme = useTheme();
  const insets = useStableSafeAreaInsets();
  const router = useRouter();
  const { user, accessToken, refreshUser } = useAuth();
  const cachedProfile = usePlaceOverview("profile");
  const isLive = useIsPlaceHomeLive("profile");
  const [favoriteCount, setFavoriteCount] = useState(cachedProfile?.favoriteCount ?? 0);

  useEffect(() => {
    if (!cachedProfile) {
      return;
    }
    setFavoriteCount(cachedProfile.favoriteCount);
  }, [cachedProfile]);

  const locationCaption = useMemo(
    () => (user ? formatProfileLocationCaption(user.city, user.countryLabel, user.showCity) : null),
    [user],
  );

  const tabBarPadding = tabBarContentInset(insets.bottom);

  const avatarHeaders =
    accessToken && user?.avatarUrl ? { Authorization: `Bearer ${accessToken}` } : undefined;

  const refreshFavoriteCount = useCallback(async () => {
    if (!accessToken) {
      setFavoriteCount(0);
      return;
    }

    try {
      const response = await fetchFavorites(accessToken);
      setFavoriteCount(response.favorites.length);
      writePlaceOverview("profile", { favoriteCount: response.favorites.length });
    } catch {
      setFavoriteCount(0);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      if (!isLive) {
        return;
      }
      void refreshFavoriteCount();
      void refreshUser();
    }, [isLive, refreshFavoriteCount, refreshUser]),
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.fillSecondary, paddingBottom: tabBarPadding },
      ]}
    >
      <ScreenHeader title="Profil" />
      <ScrollView contentContainerStyle={styles.content}>
        {user ? (
          <IdentityCard
            handle={user.handle}
            locationCaption={locationCaption}
            avatarUri={resolveAvatarUrl(user.avatarUrl ?? null)}
            avatarHeaders={avatarHeaders}
            onEditPress={() => router.push("/(tabs)/profile/edit")}
          />
        ) : null}

        <ProfileSurfaceGroup>
          <ListNavigateRow
            title="Favoritter"
            meta={favoritesMetaLine(favoriteCount)}
            icon="heart-outline"
            onPress={() => router.push("/(tabs)/profile/favoritter")}
          />
        </ProfileSurfaceGroup>

        <ProfileSurfaceGroup>
          <ListNavigateRow
            title="Indstillinger"
            icon="settings-outline"
            onPress={() => router.push("/(tabs)/profile/indstillinger")}
          />
          <View style={[styles.divider, { backgroundColor: theme.borderSubtle }]} />
          <ListNavigateRow
            title="Cookie-indstillinger"
            icon="shield-outline"
            onPress={() => router.push("/(tabs)/profile/cookie-indstillinger")}
          />
        </ProfileSurfaceGroup>
      </ScrollView>
    </View>
  );
}

registerPlaceHome("profile", ProfileHome);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: space.insetMd,
  },
  content: {
    gap: space.gapLg,
    paddingBottom: space.insetLg,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: space.insetMd + 22 + space.gapMd,
  },
});
