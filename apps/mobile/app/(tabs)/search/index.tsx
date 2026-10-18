import { Ionicons } from "@expo/vector-icons";
import type { CollectionDiscoverHome, CollectionDiscoverTypeahead } from "@kit/api-contract";
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
import { buildSearchHome, buildSearchTypeahead } from "@/search/search-view-model";
import { TypeaheadHitRow } from "@/search/typeahead-hit-row";
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
  const [fieldFocused, setFieldFocused] = useState(false);

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

  const { shelves } = buildSearchHome(home);
  const searching = query.trim().length > 0;
  const { hits, tiles, jerseyCount } = buildSearchTypeahead(typeahead);
  const typeaheadEmpty = hits.length === 0 && tiles.length === 0;
  // The lock: in focus (and while there is a query) the field takes the top and the title goes away.
  const titleHidden = fieldFocused || searching;

  return (
    <View style={[styles.container, { backgroundColor: theme.canvas }]}>
      {titleHidden ? (
        <View style={{ height: insets.top + space.insetSm }} />
      ) : (
        <ScreenHeader title="Søg" />
      )}
      <View style={styles.searchWrapper}>
        <SearchFieldDiscover
          value={query}
          onChangeText={setQuery}
          placeholder="Klub, spiller eller samler"
          accessibilityLabel="Søg"
          testID="search-input"
          onClear={() => setQuery("")}
          onFocus={() => setFieldFocused(true)}
          onBlur={() => setFieldFocused(false)}
        />
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.fillPrimary} />
        </View>
      ) : searching ? (
        typeaheadEmpty ? (
          <View testID="typeahead-empty" style={styles.centered}>
            <EmptyState
              title="Ingen resultater"
              body="Prøv et andet klub-, landsholds-, kit-, spiller- eller samlernavn."
            />
          </View>
        ) : (
          <ScrollView
            testID="search-typeahead"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.magazineContent, { paddingBottom: tabBarPadding }]}
          >
            {hits.length > 0 ? (
              <View testID="typeahead-list">
                {hits.map((hit) => (
                  <TypeaheadHitRow
                    key={hit.key}
                    hit={hit}
                    accessToken={accessToken}
                    onPress={() => router.push(hit.href)}
                  />
                ))}
              </View>
            ) : null}
            {tiles.length > 0 ? (
              <View testID="typeahead-jerseys" style={styles.shelf}>
                <View style={styles.sectionHeading}>
                  <Text style={[typography.section, { color: theme.contentPrimary }]}>Trøjer</Text>
                  <Text
                    testID="typeahead-jerseys-count"
                    style={[typography.monoSm, { color: theme.contentMuted }]}
                  >
                    {jerseyCount}
                  </Text>
                </View>
                <View style={styles.grid}>
                  {tiles.map((tile) => (
                    <View key={tile.id} style={{ width: tileWidth }}>
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
                            size="sm"
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
  sectionHeading: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.gapSm,
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
