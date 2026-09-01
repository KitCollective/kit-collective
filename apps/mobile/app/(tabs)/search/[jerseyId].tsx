import { KIT_TYPE_LABELS_DA } from "@kit/domain";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BiddingFetchError, fetchPeerJersey } from "@/api/bidding";
import { resolvePhotoUrl } from "@/api/collection";
import { addFavorite, fetchFavorites, removeFavorite } from "@/api/favorites";
import { blockPeer, reportPeer } from "@/api/moderation";
import { useAuth } from "@/auth/AuthProvider";
import { Sheet } from "@/components/catalog-ui";
import { ListPeerStubRow, ProfileSurfaceGroup } from "@/components/profile-ui";
import { Button, IconButton } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

const TAB_BAR_STYLE_VISIBLE = {
  position: "absolute" as const,
  backgroundColor: "transparent",
  borderTopWidth: 0,
  elevation: 0,
};

const BIDDING_CLOSED_HELPER =
  "Ejer har lukket for bud på denne trøje. Du kan stadig gemme den som favorit.";

export default function ForeignJerseyDetailScreen() {
  const { jerseyId } = useLocalSearchParams<{ jerseyId: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { width: screenWidth } = useWindowDimensions();
  const { accessToken } = useAuth();
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<ScrollView>(null);

  const [loading, setLoading] = useState(true);
  const [peerJersey, setPeerJersey] = useState<Awaited<ReturnType<typeof fetchPeerJersey>> | null>(
    null,
  );
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [moderationBusy, setModerationBusy] = useState(false);

  useLayoutEffect(() => {
    const tabNav = navigation.getParent();
    tabNav?.setOptions({ tabBarStyle: { display: "none" } });
    return () => {
      tabNav?.setOptions({ tabBarStyle: TAB_BAR_STYLE_VISIBLE });
    };
  }, [navigation]);

  const loadPeerJersey = useCallback(async () => {
    if (!accessToken || !jerseyId) {
      return;
    }

    try {
      const [response, favorites] = await Promise.all([
        fetchPeerJersey(accessToken, jerseyId),
        fetchFavorites(accessToken),
      ]);
      setPeerJersey(response);
      setIsFavorite(favorites.favorites.some((item) => item.userJerseyId === jerseyId));
      setPhotoIndex(0);
    } catch (caught) {
      if (caught instanceof BiddingFetchError && caught.status === 404) {
        setPeerJersey(null);
      } else {
        throw caught;
      }
    }
  }, [accessToken, jerseyId]);

  useEffect(() => {
    let active = true;

    async function run() {
      try {
        await loadPeerJersey();
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
  }, [loadPeerJersey]);

  const handleToggleFavorite = async () => {
    if (!accessToken || !jerseyId || favoriteBusy) {
      return;
    }

    setFavoriteBusy(true);
    try {
      if (isFavorite) {
        await removeFavorite(accessToken, jerseyId);
        setIsFavorite(false);
      } else {
        await addFavorite(accessToken, { userJerseyId: jerseyId });
        setIsFavorite(true);
      }
    } catch {
      Alert.alert("Favorit", "Favoritten kunne ikke opdateres.");
    } finally {
      setFavoriteBusy(false);
    }
  };

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
    if (!peerJersey) {
      return;
    }

    void runModeration("Rapportér", () => reportPeer(accessToken!, peerJersey.ownerId, {}));
  };

  const handleBlock = () => {
    if (!peerJersey) {
      return;
    }

    void runModeration("Blokér", () => blockPeer(accessToken!, peerJersey.ownerId));
  };

  const onPhotoScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
    setPhotoIndex(index);
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.canvas }]}>
        <ActivityIndicator color={theme.fillPrimary} />
      </View>
    );
  }

  if (!peerJersey) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.canvas }]}>
        <Text style={[typography.body, { color: theme.contentSecondary }]}>Trøjen findes ikke</Text>
        <IconButton name="Tilbage" icon="arrow-back" onPress={() => router.back()} />
      </View>
    );
  }

  const metaLine = `${peerJersey.seasonLabel} · ${KIT_TYPE_LABELS_DA[peerJersey.type]}`;
  const showPagerDots = peerJersey.photos.length > 1;

  return (
    <View style={[styles.root, { backgroundColor: theme.fillPrimary }]}>
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onPhotoScroll}
        style={styles.stage}
        contentContainerStyle={styles.stageContent}
      >
        {peerJersey.photos.map((photo) => (
          <Image
            key={photo.id}
            source={{
              uri: resolvePhotoUrl(photo.photoUrl),
              headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
            }}
            style={[styles.stagePhoto, { width: screenWidth }]}
            resizeMode="cover"
            accessibilityLabel={`${peerJersey.clubLabel} ${photo.role}`}
          />
        ))}
      </ScrollView>

      <View style={[styles.stageChrome, { paddingTop: insets.top + space.insetSm }]}>
        <IconButton
          name="Tilbage"
          icon="arrow-back"
          iconColor={theme.contentInverse}
          onPress={() => router.back()}
        />
        <View style={styles.chromeActions}>
          <IconButton
            name={isFavorite ? "Fjern favorit" : "Gem favorit"}
            icon={isFavorite ? "heart" : "heart-outline"}
            iconColor={theme.contentInverse}
            disabled={favoriteBusy}
            onPress={() => void handleToggleFavorite()}
          />
          <IconButton
            name="Flere handlinger"
            icon="ellipsis-horizontal"
            iconColor={theme.contentInverse}
            onPress={() => setOverflowOpen(true)}
          />
        </View>
      </View>

      {showPagerDots ? (
        <View
          style={[styles.pagerDots, { top: insets.top + space.insetSm + 44 }]}
          accessibilityLabel={`Foto ${photoIndex + 1} af ${peerJersey.photos.length}`}
        >
          {peerJersey.photos.map((photo, index) => (
            <View
              key={photo.id}
              style={[
                styles.pagerDot,
                {
                  backgroundColor: theme.contentInverse,
                  opacity: index === photoIndex ? 1 : 0.35,
                },
              ]}
            />
          ))}
        </View>
      ) : null}

      <View
        style={[
          styles.bottomSheet,
          {
            backgroundColor: theme.surfaceRaised,
            paddingBottom: insets.bottom + space.insetMd,
          },
        ]}
      >
        <View
          style={[styles.sheetHandle, { backgroundColor: theme.borderSubtle }]}
          accessibilityElementsHidden
        />
        <Text style={[typography.title, { color: theme.contentPrimary }]}>
          {peerJersey.clubLabel}
        </Text>
        <Text style={[typography.mono, { color: theme.contentSecondary }]}>{metaLine}</Text>

        <ProfileSurfaceGroup>
          <ListPeerStubRow
            handle={peerJersey.ownerHandle}
            meta="Samler"
            onPress={() =>
              Alert.alert("Peer profil", "Profilvisning kommer i næste milepæl (KIT-153).")
            }
          />
        </ProfileSurfaceGroup>

        {peerJersey.biddingEnabled ? (
          <Button
            label="Send bud"
            width="fill"
            onPress={() => router.push(`/(tabs)/search/send-bid/${jerseyId}`)}
          />
        ) : (
          <Text style={[typography.body, { color: theme.contentSecondary }]}>
            {BIDDING_CLOSED_HELPER}
          </Text>
        )}
      </View>

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
  root: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.gapMd,
  },
  stage: {
    ...StyleSheet.absoluteFillObject,
  },
  stageContent: {
    flexGrow: 1,
  },
  stagePhoto: {
    height: "100%",
  },
  stageChrome: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.insetMd,
  },
  chromeActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm,
  },
  pagerDots: {
    position: "absolute",
    alignSelf: "center",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.gapSm,
  },
  pagerDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  bottomSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.insetLg,
    paddingTop: space.insetMd,
    gap: space.gapMd,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    marginBottom: space.gapSm,
  },
  overflowActions: {
    gap: space.gapSm,
  },
});
