import { formatProfileLocationCaption } from "@kit/domain";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchFavorites } from "@/api/favorites";
import { resolveAvatarUrl } from "@/api/identity";
import { useAuth } from "@/auth/AuthProvider";
import { favoritesMetaLine } from "@/components/favorites-meta";
import { IdentityCard, ListNavigateRow, ProfileSurfaceGroup } from "@/components/profile-ui";
import { ScreenHeader } from "@/components/screen-header";
import { tabBarContentInset } from "@/components/tab-bar-metrics";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export default function ProfileHomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, accessToken, refreshUser } = useAuth();
  const [favoriteCount, setFavoriteCount] = useState(0);

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
    } catch {
      setFavoriteCount(0);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      void refreshFavoriteCount();
      void refreshUser();
    }, [refreshFavoriteCount, refreshUser]),
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
