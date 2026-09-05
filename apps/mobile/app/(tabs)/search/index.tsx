import type {
  CollectionDiscoverHome,
  CollectionDiscoverHomeClub,
  CollectionDiscoverHomeCollector,
  CollectionDiscoverJersey,
  CollectionDiscoverTypeahead,
} from "@kit/api-contract";
import { KIT_TYPE_LABELS_DA } from "@kit/domain";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchDiscoverHome, fetchDiscoverTypeahead } from "@/api/bidding";
import { resolvePhotoUrl } from "@/api/collection";
import { resolvePeerAvatarUrl } from "@/api/peer-profile";
import { useAuth } from "@/auth/AuthProvider";
import { Avatar } from "@/components/avatar";
import { ListRow, Mark, SearchField } from "@/components/catalog-ui";
import { JerseyTile } from "@/components/jersey-tile";
import { ScreenHeader } from "@/components/screen-header";
import { tabBarContentInset } from "@/components/tab-bar-metrics";
import { EmptyState } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export default function SearchScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { width } = useWindowDimensions();
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const tabBarPadding = tabBarContentInset(insets.bottom);
  const [loading, setLoading] = useState(true);
  const [home, setHome] = useState<CollectionDiscoverHome>({});
  const [typeahead, setTypeahead] = useState<CollectionDiscoverTypeahead>({});
  const [query, setQuery] = useState("");

  const loadMagazine = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    if (query.trim()) {
      setTypeahead(await fetchDiscoverTypeahead(accessToken, query));
      return;
    }

    const response = await fetchDiscoverHome(accessToken);
    setHome(response);
    setTypeahead({});
  }, [accessToken, query]);

  useEffect(() => {
    let active = true;

    async function run() {
      if (!accessToken) {
        return;
      }

      setLoading(true);
      try {
        await loadMagazine();
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    const timer = setTimeout(() => {
      void run();
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [accessToken, loadMagazine]);

  const columnGap = space.gapMd;
  const horizontalPadding = space.insetMd * 2;
  const tileWidth = (width - horizontalPadding - columnGap) / 2;

  const openForeignDetail = (jerseyId: string) => {
    router.push(`/(tabs)/search/${jerseyId}`);
  };

  const openClubDrill = (club: CollectionDiscoverHomeClub) => {
    router.push(`/(tabs)/search/club/${club.clubId}?label=${encodeURIComponent(club.clubLabel)}`);
  };

  const openPeerProfile = (collector: CollectionDiscoverHomeCollector) => {
    router.push(`/(tabs)/search/peer/${collector.handle}`);
  };

  const openPlayerDrill = (playerId: string, playerLabel: string) => {
    router.push(`/(tabs)/search/player/${playerId}?label=${encodeURIComponent(playerLabel)}`);
  };

  const openKitDrill = (kitId: string, label: string) => {
    router.push(`/(tabs)/search/kit/${kitId}?label=${encodeURIComponent(label)}`);
  };

  const photoSource = (jersey: CollectionDiscoverJersey) => {
    const primaryPhoto = jersey.photos[0];
    return primaryPhoto
      ? {
          uri: resolvePhotoUrl(primaryPhoto.photoUrl),
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        }
      : undefined;
  };

  const renderJerseyTile = (jersey: CollectionDiscoverJersey, tileSize: number) => (
    <View key={jersey.id} style={{ width: tileSize }}>
      <JerseyTile
        photoSource={photoSource(jersey)}
        clubLabel={jersey.clubLabel}
        seasonLabel={jersey.seasonLabel}
        typeLabel={KIT_TYPE_LABELS_DA[jersey.type]}
        onPress={() => openForeignDetail(jersey.id)}
      />
    </View>
  );

  const clubs = home.clubs ?? [];
  const openForBid = home.openForBid ?? [];
  const collectors = home.collectors ?? [];
  const moreJerseys = home.moreJerseys ?? [];
  const magazineEmpty =
    clubs.length === 0 &&
    openForBid.length === 0 &&
    collectors.length === 0 &&
    moreJerseys.length === 0;
  const searching = query.trim().length > 0;
  const typeaheadClubs = typeahead.clubs ?? [];
  const typeaheadKits = typeahead.kits ?? [];
  const typeaheadPlayers = typeahead.players ?? [];
  const typeaheadCollectors = typeahead.collectors ?? [];
  const typeaheadJerseys = typeahead.jerseys ?? [];
  const typeaheadEmpty =
    typeaheadClubs.length === 0 &&
    typeaheadKits.length === 0 &&
    typeaheadPlayers.length === 0 &&
    typeaheadCollectors.length === 0 &&
    typeaheadJerseys.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.canvas }]}>
      <ScreenHeader title="Søg" />
      <View style={styles.searchWrapper}>
        <SearchField
          variant="collection"
          value={query}
          onChangeText={setQuery}
          placeholder="Søg"
          accessibilityLabel="Søg"
          onClear={() => setQuery("")}
        />
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.fillPrimary} />
        </View>
      ) : searching ? (
        typeaheadEmpty ? (
          <EmptyState
            title="Ingen resultater"
            body="Prøv et andet klub-, kit-, spiller- eller samlernavn."
          />
        ) : (
          <ScrollView
            testID="search-typeahead"
            contentContainerStyle={[styles.magazineContent, { paddingBottom: tabBarPadding }]}
          >
            {typeaheadClubs.length > 0 ? (
              <View testID="typeahead-clubs" style={styles.shelf}>
                <Text style={[typography.section, { color: theme.contentPrimary }]}>Klubber</Text>
                {typeaheadClubs.map((club) => (
                  <ListRow
                    key={club.clubId}
                    title={club.clubLabel}
                    onPress={() => openClubDrill(club)}
                  />
                ))}
              </View>
            ) : null}
            {typeaheadKits.length > 0 ? (
              <View testID="typeahead-kits" style={styles.shelf}>
                <Text style={[typography.section, { color: theme.contentPrimary }]}>Kits</Text>
                {typeaheadKits.map((kitHit) => (
                  <ListRow
                    key={kitHit.kitId}
                    title={kitHit.label}
                    onPress={() => openKitDrill(kitHit.kitId, kitHit.label)}
                  />
                ))}
              </View>
            ) : null}
            {typeaheadPlayers.length > 0 ? (
              <View testID="typeahead-players" style={styles.shelf}>
                <Text style={[typography.section, { color: theme.contentPrimary }]}>Spillere</Text>
                {typeaheadPlayers.map((playerHit) => (
                  <ListRow
                    key={playerHit.playerId}
                    title={playerHit.playerLabel}
                    onPress={() => openPlayerDrill(playerHit.playerId, playerHit.playerLabel)}
                  />
                ))}
              </View>
            ) : null}
            {typeaheadCollectors.length > 0 ? (
              <View testID="typeahead-collectors" style={styles.shelf}>
                <Text style={[typography.section, { color: theme.contentPrimary }]}>Samlere</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rail}
                >
                  {typeaheadCollectors.map((collector) => {
                    const avatarUri = resolvePeerAvatarUrl(collector.avatarUrl);
                    return (
                      <Pressable
                        key={collector.handle}
                        accessibilityRole="button"
                        accessibilityLabel={collector.handle}
                        onPress={() => openPeerProfile(collector)}
                        style={styles.collector}
                      >
                        <Avatar
                          handle={collector.handle}
                          uri={avatarUri}
                          uriHeaders={
                            accessToken && avatarUri
                              ? { Authorization: `Bearer ${accessToken}` }
                              : undefined
                          }
                          size="md"
                        />
                        <Text
                          style={[typography.headingSm, { color: theme.contentPrimary }]}
                          numberOfLines={1}
                        >
                          {collector.handle}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}
            {typeaheadJerseys.length > 0 ? (
              <View testID="typeahead-jerseys" style={styles.shelf}>
                <Text style={[typography.section, { color: theme.contentPrimary }]}>Trøjer</Text>
                <View style={styles.grid}>
                  {typeaheadJerseys.map((jersey) => renderJerseyTile(jersey, tileWidth))}
                </View>
              </View>
            ) : null}
          </ScrollView>
        )
      ) : magazineEmpty ? (
        <EmptyState
          title="Ingen trøjer at browse"
          body="Når andre samlere gemmer synlige trøjer, vises de her."
        />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.magazineContent, { paddingBottom: tabBarPadding }]}
        >
          {clubs.length > 0 ? (
            <View testID="magazine-shelf-clubs" style={styles.shelf}>
              <Text style={[typography.section, { color: theme.contentPrimary }]}>Klubber</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
              >
                {clubs.map((club) => (
                  <Pressable
                    key={club.clubId}
                    accessibilityRole="button"
                    accessibilityLabel={club.clubLabel}
                    onPress={() => openClubDrill(club)}
                    style={styles.clubMark}
                  >
                    <Mark label={club.clubLabel} size="md" />
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
          {openForBid.length > 0 ? (
            <View testID="magazine-shelf-open-for-bid" style={styles.shelf}>
              <Text style={[typography.section, { color: theme.contentPrimary }]}>
                Åbne for bud
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
              >
                {openForBid.map((jersey) => renderJerseyTile(jersey, tileWidth))}
              </ScrollView>
            </View>
          ) : null}
          {collectors.length > 0 ? (
            <View testID="magazine-shelf-collectors" style={styles.shelf}>
              <Text style={[typography.section, { color: theme.contentPrimary }]}>Samlere</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
              >
                {collectors.map((collector) => {
                  const avatarUri = resolvePeerAvatarUrl(collector.avatarUrl);
                  return (
                    <Pressable
                      key={collector.handle}
                      accessibilityRole="button"
                      accessibilityLabel={collector.handle}
                      onPress={() => openPeerProfile(collector)}
                      style={styles.collector}
                    >
                      <Avatar
                        handle={collector.handle}
                        uri={avatarUri}
                        uriHeaders={
                          accessToken && avatarUri
                            ? { Authorization: `Bearer ${accessToken}` }
                            : undefined
                        }
                        size="md"
                      />
                      <Text
                        style={[typography.headingSm, { color: theme.contentPrimary }]}
                        numberOfLines={1}
                      >
                        {collector.handle}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
          {moreJerseys.length > 0 ? (
            <View testID="magazine-shelf-more-jerseys" style={styles.shelf}>
              <Text style={[typography.section, { color: theme.contentPrimary }]}>
                Flere trøjer
              </Text>
              <View style={styles.grid}>
                {moreJerseys.map((jersey) => renderJerseyTile(jersey, tileWidth))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchWrapper: {
    paddingHorizontal: space.insetMd,
    marginBottom: space.insetMd,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  magazineContent: {
    paddingHorizontal: space.insetMd,
    gap: space.gapLg,
  },
  shelf: {
    gap: space.gapMd,
  },
  rail: {
    gap: space.gapMd,
    paddingRight: space.insetMd,
  },
  clubMark: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  collector: {
    alignItems: "center",
    gap: space.gapSm,
    maxWidth: 56,
  },
  gridContent: {
    paddingHorizontal: space.insetMd,
    gap: space.gapMd,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.gapMd,
  },
});
