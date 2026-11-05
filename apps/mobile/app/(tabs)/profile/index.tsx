import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchCollectionJerseys } from "@/api/collection";
import { fetchFavorites } from "@/api/favorites";
import { resolveAvatarUrl } from "@/api/identity";
import { useAuth } from "@/auth/AuthProvider";
import { Avatar } from "@/components/avatar";
import { ProfileFlatSection, ProfileHomeRow, ProfileRowDivider } from "@/components/profile-ui";
import { ScreenHeader } from "@/components/screen-header";
import { tabBarContentInset } from "@/components/tab-bar-metrics";
import { Button, IconButton } from "@/components/ui";
import { registerPlaceHome, useIsPlaceHomeLive } from "@/navigation/place-homes";
import { writePlaceOverview } from "@/navigation/place-overview-cache";
import { PlacePagerScreen } from "@/navigation/place-pager-screen";
import { usePlaceOverview } from "@/navigation/use-place-overview";
import { identityCaption, profileHomeRows } from "@/profile/profile-view-model";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useStableSafeAreaInsets } from "@/theme/use-stable-safe-area-insets";
import { useTheme } from "@/theme/use-theme";

export default function ProfileHomeScreen() {
  return <PlacePagerScreen place="profile" />;
}

function ProfileHome() {
  const theme = useTheme();
  const typography = useTypography();
  const insets = useStableSafeAreaInsets();
  const router = useRouter();
  const { user, accessToken, refreshUser } = useAuth();
  const cachedProfile = usePlaceOverview("profile");
  const isLive = useIsPlaceHomeLive("profile");
  const [favoriteCount, setFavoriteCount] = useState(cachedProfile?.favoriteCount ?? 0);
  // The number Se som andre shows: only the jerseys other Collectors can see.
  const [visibleJerseyCount, setVisibleJerseyCount] = useState(0);

  useEffect(() => {
    if (!cachedProfile) {
      return;
    }
    setFavoriteCount(cachedProfile.favoriteCount);
  }, [cachedProfile]);

  const tabBarPadding = tabBarContentInset(insets.bottom);

  const avatarHeaders =
    accessToken && user?.avatarUrl ? { Authorization: `Bearer ${accessToken}` } : undefined;

  const refreshCounts = useCallback(async () => {
    if (!accessToken) {
      setFavoriteCount(0);
      setVisibleJerseyCount(0);
      return;
    }

    try {
      const response = await fetchFavorites(accessToken);
      setFavoriteCount(response.favorites.length);
      writePlaceOverview("profile", { favoriteCount: response.favorites.length });
    } catch {
      setFavoriteCount(0);
    }

    try {
      const response = await fetchCollectionJerseys(accessToken);
      setVisibleJerseyCount(response.jerseys.filter((jersey) => !jersey.private).length);
    } catch {
      setVisibleJerseyCount(0);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      if (!isLive) {
        return;
      }
      void refreshCounts();
      void refreshUser();
    }, [isLive, refreshCounts, refreshUser]),
  );

  const caption = user
    ? identityCaption({
        city: user.city,
        countryLabel: user.countryLabel,
        showCity: user.showCity,
        jerseyCount: visibleJerseyCount,
      })
    : null;

  const entitlement = user?.entitlement ?? null;
  const rows = useMemo(
    () => profileHomeRows({ favoriteCount, entitlement, now: new Date() }),
    [favoriteCount, entitlement],
  );

  return (
    <View
      style={[styles.container, { backgroundColor: theme.canvas, paddingBottom: tabBarPadding }]}
    >
      <ScreenHeader
        title="Profil"
        trailing={
          <View style={[styles.settingsButton, { backgroundColor: theme.fillSecondary }]}>
            <IconButton
              name="Indstillinger"
              icon="settings-outline"
              onPress={() => router.push("/(tabs)/profile/indstillinger")}
            />
          </View>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        {user ? (
          <View style={styles.identityRow}>
            <Avatar
              handle={user.handle}
              uri={resolveAvatarUrl(user.avatarUrl ?? null)}
              uriHeaders={avatarHeaders}
              size="lg"
            />
            <View style={styles.identityText}>
              <Text style={[typography.label, styles.handle, { color: theme.contentPrimary }]}>
                {user.handle}
              </Text>
              {caption ? (
                <Text style={[typography.mono, { color: theme.contentSecondary }]}>{caption}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.buttonRow}>
          <View style={styles.buttonCell}>
            <Button
              label="Rediger profil"
              variant="secondary"
              width="fill"
              onPress={() => router.push("/(tabs)/profile/edit")}
            />
          </View>
          <View style={styles.buttonCell}>
            <Button
              label="Se som andre"
              variant="secondary"
              width="fill"
              disabled={!user}
              onPress={() =>
                user &&
                router.push({
                  pathname: "/(tabs)/profile/se-som-andre",
                  params: { handle: user.handle },
                })
              }
            />
          </View>
        </View>

        <ProfileFlatSection>
          {rows.map((row, index) => (
            <View key={row.key}>
              {index > 0 ? <ProfileRowDivider inset={false} /> : null}
              <ProfileHomeRow
                label={row.label}
                value={row.value}
                accessibilityLabel={row.accessibilityLabel}
                monoValue={row.key === "favorites"}
                onPress={
                  row.key === "favorites"
                    ? () => router.push("/(tabs)/profile/favoritter")
                    : undefined
                }
              />
            </View>
          ))}
        </ProfileFlatSection>
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
  settingsButton: {
    borderRadius: 22,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
  },
  identityText: {
    flex: 1,
    gap: 2,
  },
  handle: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "600",
  },
  buttonRow: {
    flexDirection: "row",
    gap: space.gapSm,
  },
  buttonCell: {
    flex: 1,
  },
});
