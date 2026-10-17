import { Ionicons } from "@expo/vector-icons";
import type {
  CollectionDiscoverHome,
  CollectionDiscoverHomeClub,
  CollectionDiscoverHomeCollector,
  CollectionDiscoverHomeNationalTeam,
  CollectionDiscoverJersey,
  CollectionDiscoverTypeahead,
} from "@kit/api-contract";
import { KIT_TYPE_LABELS_DA } from "@kit/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { fetchDiscoverHome, fetchDiscoverTypeahead } from "@/api/bidding";
import { resolvePeerAvatarUrl } from "@/api/peer-profile";
import { useAuth } from "@/auth/AuthProvider";
import { Avatar } from "@/components/avatar";
import { ListRow } from "@/components/catalog-ui";
import { Chip } from "@/components/chip";
import { JerseyTile } from "@/components/jersey-tile";
import { ScreenHeader } from "@/components/screen-header";
import { SearchFieldDiscover } from "@/components/search-field-discover";
import { tabBarContentInset } from "@/components/tab-bar-metrics";
import { Button, EmptyState } from "@/components/ui";
import { registerPlaceHome, useIsPlaceHomeLive } from "@/navigation/place-homes";
import { readPlaceOverview, writePlaceOverview } from "@/navigation/place-overview-cache";
import { PlacePagerScreen } from "@/navigation/place-pager-screen";
import { usePlaceOverview } from "@/navigation/use-place-overview";
import { OpenForBidScreen } from "@/search/open-for-bid-screen";
import { searchTilePhotoSource } from "@/search/search-tile-photo";
import { buildSearchHome } from "@/search/search-view-model";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useStableSafeAreaInsets } from "@/theme/use-stable-safe-area-insets";
import { useTheme } from "@/theme/use-theme";

export default function SearchScreen() {
  const { shelf } = useLocalSearchParams<{ shelf?: string }>();
  const insets = useStableSafeAreaInsets();

  // Se alle on the Åbne for bud shelf: a pushed entry of this route, so back returns to the home.
  if (shelf === "open-for-bid") {
    return <OpenForBidScreen contentPaddingBottom={tabBarContentInset(insets.bottom)} />;
  }
  return <PlacePagerScreen place="search" />;
}

function SearchHome() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { width } = useWindowDimensions();
  const theme = useTheme();
  const typography = useTypography();
  const insets = useStableSafeAreaInsets();
  const tabBarPadding = tabBarContentInset(insets.bottom);
  const cachedSearch = usePlaceOverview("search");
  const isLive = useIsPlaceHomeLive("search");
  const [loading, setLoading] = useState(cachedSearch == null);
  const [home, setHome] = useState<CollectionDiscoverHome>(cachedSearch?.home ?? {});
  const [typeahead, setTypeahead] = useState<CollectionDiscoverTypeahead>({});
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!cachedSearch || query.trim()) {
      return;
    }
    setHome(cachedSearch.home);
    setLoading(false);
  }, [cachedSearch, query]);

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
    writePlaceOverview("search", { home: response });
  }, [accessToken, query]);

  useEffect(() => {
    let active = true;

    async function run() {
      if (!accessToken || !isLive) {
        return;
      }

      if (readPlaceOverview("search") == null || query.trim()) {
        setLoading(true);
      }
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
  }, [accessToken, isLive, loadMagazine, query]);

  const columnGap = space.gapMd;
  const horizontalPadding = space.insetMd * 2;
  const tileWidth = (width - horizontalPadding - columnGap) / 2;

  const openForeignDetail = (jerseyId: string) => {
    router.push(`/(tabs)/search/${jerseyId}`);
  };

  const openClubDrill = (club: CollectionDiscoverHomeClub) => {
    router.push(`/(tabs)/search/club/${club.clubId}?label=${encodeURIComponent(club.clubLabel)}`);
  };

  const openNationalTeamDrill = (team: CollectionDiscoverHomeNationalTeam) => {
    router.push(
      `/(tabs)/search/national-team/${team.nationalTeamId}?label=${encodeURIComponent(team.nationalTeamLabel)}`,
    );
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

  const photoSource = (jersey: CollectionDiscoverJersey) =>
    searchTilePhotoSource(jersey.photos[0] ?? null, accessToken);

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

  const { shelves } = buildSearchHome(home);
  const searching = query.trim().length > 0;
  const typeaheadClubs = typeahead.clubs ?? [];
  const typeaheadNationalTeams = typeahead.nationalTeams ?? [];
  const typeaheadKits = typeahead.kits ?? [];
  const typeaheadPlayers = typeahead.players ?? [];
  const typeaheadCollectors = typeahead.collectors ?? [];
  const typeaheadJerseys = typeahead.jerseys ?? [];
  const typeaheadEmpty =
    typeaheadClubs.length === 0 &&
    typeaheadNationalTeams.length === 0 &&
    typeaheadKits.length === 0 &&
    typeaheadPlayers.length === 0 &&
    typeaheadCollectors.length === 0 &&
    typeaheadJerseys.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.canvas }]}>
      <ScreenHeader title="Søg" />
      <View style={styles.searchWrapper}>
        <SearchFieldDiscover
          value={query}
          onChangeText={setQuery}
          placeholder="Klub, spiller eller samler"
          accessibilityLabel="Søg"
          testID="search-input"
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
            body="Prøv et andet klub-, landsholds-, kit-, spiller- eller samlernavn."
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
                    testID="typeahead-club-row"
                    onPress={() => openClubDrill(club)}
                  />
                ))}
              </View>
            ) : null}
            {typeaheadNationalTeams.length > 0 ? (
              <View testID="typeahead-national-teams" style={styles.shelf}>
                <Text style={[typography.section, { color: theme.contentPrimary }]}>Landshold</Text>
                {typeaheadNationalTeams.map((team) => (
                  <ListRow
                    key={team.nationalTeamId}
                    title={team.nationalTeamLabel}
                    onPress={() => openNationalTeamDrill(team)}
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
      ) : shelves.length === 0 ? (
        <EmptyState
          title="Ingen trøjer at browse"
          body="Når andre samlere gemmer synlige trøjer, vises de her."
        />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.magazineContent, { paddingBottom: tabBarPadding }]}
        >
          {shelves.map((shelf) => {
            switch (shelf.kind) {
              case "open-for-bid":
                return (
                  <View key={shelf.kind} testID="magazine-shelf-open-for-bid" style={styles.shelf}>
                    <View style={styles.shelfHeading}>
                      <Text style={[typography.section, { color: theme.contentPrimary }]}>
                        Åbne for bud
                      </Text>
                      <Button
                        label="Se alle"
                        variant="tertiary"
                        onPress={() => router.push(shelf.seeAllHref)}
                      />
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.rail}
                    >
                      {shelf.tiles.map((tile) => (
                        <View key={tile.id} style={styles.shelfTile}>
                          <JerseyTile
                            photoSource={searchTilePhotoSource(tile.photo, accessToken)}
                            clubLabel={tile.clubLabel}
                            seasonLabel={tile.seasonLabel}
                            typeLabel={tile.typeLabel}
                            caption={tile.caption}
                            onPress={() => router.push(tile.href)}
                            testID={`jersey-tile-${tile.id}`}
                          />
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                );
              case "sides":
                return (
                  <View key={shelf.kind} testID="magazine-shelf-sides" style={styles.shelf}>
                    <Text style={[typography.section, { color: theme.contentPrimary }]}>
                      Klubber og landshold
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chipRail}
                    >
                      {shelf.chips.map((chip) => (
                        <Chip
                          key={chip.key}
                          label={chip.label}
                          onPress={() => router.push(chip.href)}
                        />
                      ))}
                    </ScrollView>
                  </View>
                );
              case "collectors":
                return (
                  <View key={shelf.kind} testID="magazine-shelf-collectors" style={styles.shelf}>
                    <Text style={[typography.section, { color: theme.contentPrimary }]}>
                      Samlere
                    </Text>
                    {shelf.rows.map((row) => {
                      const avatarUri = resolvePeerAvatarUrl(row.avatarUrl);
                      return (
                        <Pressable
                          key={row.handle}
                          accessibilityRole="button"
                          accessibilityLabel={`${row.handle}, ${row.caption}`}
                          onPress={() => router.push(row.href)}
                          style={({ pressed }) => [styles.collectorRow, pressed && styles.pressed]}
                        >
                          <Avatar
                            handle={row.handle}
                            uri={avatarUri}
                            uriHeaders={
                              accessToken && avatarUri
                                ? { Authorization: `Bearer ${accessToken}` }
                                : undefined
                            }
                            size="md"
                          />
                          <View style={styles.collectorText}>
                            <Text
                              style={[typography.headingSm, { color: theme.contentPrimary }]}
                              numberOfLines={1}
                            >
                              {row.handle}
                            </Text>
                            <Text
                              style={[typography.caption, { color: theme.contentSecondary }]}
                              numberOfLines={1}
                            >
                              {row.caption}
                            </Text>
                          </View>
                          <Ionicons
                            name="chevron-forward"
                            size={18}
                            color={theme.contentMuted}
                            accessibilityElementsHidden
                          />
                        </Pressable>
                      );
                    })}
                  </View>
                );
              default:
                return null;
            }
          })}
        </ScrollView>
      )}
    </View>
  );
}

registerPlaceHome("search", SearchHome);

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
  shelfHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shelfTile: {
    width: 148,
  },
  chipRail: {
    gap: space.gapSm,
    paddingRight: space.insetMd,
  },
  collectorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
    minHeight: 56,
  },
  collectorText: {
    flex: 1,
  },
  pressed: {
    opacity: 0.9,
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
