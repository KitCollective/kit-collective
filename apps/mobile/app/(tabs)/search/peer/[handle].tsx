import type { CollectionDiscoverJersey, IdentityPeerProfile } from "@kit/api-contract";
import { formatProfileLocationCaption, KIT_TYPE_LABELS_DA } from "@kit/domain";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolvePhotoUrl } from "@/api/collection";
import { blockPeer, reportPeer } from "@/api/moderation";
import {
  fetchPeerJerseys,
  fetchPeerProfileByHandle,
  PeerProfileFetchError,
  resolvePeerAvatarUrl,
} from "@/api/peer-profile";
import { useAuth } from "@/auth/AuthProvider";
import { Sheet } from "@/components/catalog-ui";
import { JerseyTile } from "@/components/jersey-tile";
import { DrillHeader, PeerIdentityCard, ProfileSurfaceGroup } from "@/components/profile-ui";
import { Button, EmptyState, IconButton } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

const TAB_BAR_STYLE_VISIBLE = {
  position: "absolute" as const,
  backgroundColor: "transparent",
  borderTopWidth: 0,
  elevation: 0,
};

export default function PeerProfileScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const { accessToken } = useAuth();
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<IdentityPeerProfile | null>(null);
  const [jerseys, setJerseys] = useState<CollectionDiscoverJersey[]>([]);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [moderationBusy, setModerationBusy] = useState(false);

  useLayoutEffect(() => {
    const tabNav = navigation.getParent();
    tabNav?.setOptions({ tabBarStyle: { display: "none" } });
    return () => {
      tabNav?.setOptions({ tabBarStyle: TAB_BAR_STYLE_VISIBLE });
    };
  }, [navigation]);

  const loadProfile = useCallback(async () => {
    if (!accessToken || !handle) {
      return;
    }

    try {
      const peerProfile = await fetchPeerProfileByHandle(accessToken, handle);
      const peerJerseys = await fetchPeerJerseys(accessToken, peerProfile.id);
      setProfile(peerProfile);
      setJerseys(peerJerseys.jerseys);
    } catch (caught) {
      if (caught instanceof PeerProfileFetchError && caught.status === 404) {
        setProfile(null);
        setJerseys([]);
      } else {
        throw caught;
      }
    }
  }, [accessToken, handle]);

  useEffect(() => {
    let active = true;

    async function run() {
      try {
        await loadProfile();
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, [loadProfile]);

  const locationCaption = useMemo(
    () =>
      profile
        ? formatProfileLocationCaption(profile.city, profile.countryLabel, profile.showCity)
        : null,
    [profile],
  );

  const avatarHeaders =
    accessToken && profile?.avatarUrl ? { Authorization: `Bearer ${accessToken}` } : undefined;

  const columnGap = space.gapMd;
  const horizontalPadding = space.insetMd * 2;
  const tileWidth = (width - horizontalPadding - columnGap) / 2;

  const runModeration = async (label: string, action: () => Promise<void>) => {
    if (!accessToken || moderationBusy) {
      return;
    }

    setModerationBusy(true);
    setOverflowOpen(false);
    try {
      await action();
      Alert.alert(label, "Handlingen er gennemført.", [
        {
          text: "OK",
          onPress: () => router.back(),
        },
      ]);
    } catch {
      Alert.alert(label, "Handlingen kunne ikke gennemføres.");
    } finally {
      setModerationBusy(false);
    }
  };

  const handleReport = () => {
    if (!profile) {
      return;
    }

    void runModeration("Rapportér", () => reportPeer(accessToken!, profile.id, {}));
  };

  const handleBlock = () => {
    if (!profile) {
      return;
    }

    void runModeration("Blokér", () => blockPeer(accessToken!, profile.id));
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.fillSecondary }]}>
        <ActivityIndicator color={theme.fillPrimary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, { backgroundColor: theme.fillSecondary }]}>
        <View style={{ paddingTop: insets.top }}>
          <DrillHeader title="Profil" onBack={() => router.back()} />
        </View>
        <View style={styles.centered}>
          <Text style={[typography.body, { color: theme.contentSecondary }]}>
            Profilen findes ikke
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.fillSecondary }]}>
      <View style={{ paddingTop: insets.top }}>
        <DrillHeader
          title="Profil"
          onBack={() => router.back()}
          trailing={
            <IconButton
              name="Flere handlinger"
              icon="ellipsis-horizontal"
              onPress={() => setOverflowOpen(true)}
            />
          }
        />
      </View>

      <FlatList
        data={jerseys}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: columnGap }}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + space.insetLg },
        ]}
        ListHeaderComponent={
          <ProfileSurfaceGroup>
            <PeerIdentityCard
              handle={profile.handle}
              locationCaption={locationCaption}
              aboutMe={profile.aboutMe}
              avatarUri={resolvePeerAvatarUrl(profile.avatarUrl)}
              avatarHeaders={avatarHeaders}
            />
          </ProfileSurfaceGroup>
        }
        ListEmptyComponent={
          <EmptyState title="Ingen trøjer endnu" body="Samleren har ingen synlige trøjer." />
        }
        renderItem={({ item }) => (
          <View style={{ width: tileWidth }}>
            <JerseyTile
              photoSource={{
                uri: resolvePhotoUrl(item.photos[0]?.photoUrl ?? ""),
                headers: avatarHeaders,
              }}
              clubLabel={item.clubLabel}
              seasonLabel={item.seasonLabel}
              typeLabel={KIT_TYPE_LABELS_DA[item.type]}
              onPress={() => router.push(`/(tabs)/search/${item.id}`)}
            />
          </View>
        )}
      />

      <Sheet visible={overflowOpen} title="Handlinger" onDismiss={() => setOverflowOpen(false)}>
        <View style={styles.overflowActions}>
          <Button
            label="Rapportér"
            variant="secondary"
            width="fill"
            disabled={moderationBusy}
            onPress={handleReport}
          />
          <Button
            label="Blokér"
            variant="destructive"
            width="fill"
            disabled={moderationBusy}
            onPress={handleBlock}
          />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.gapMd,
  },
  listContent: {
    paddingHorizontal: space.insetMd,
    gap: space.gapMd,
  },
  overflowActions: {
    gap: space.gapSm,
  },
});
