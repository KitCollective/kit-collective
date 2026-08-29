import type { CollectionDiscoverJersey } from "@kit/api-contract";
import { KIT_TYPE_LABELS_DA } from "@kit/domain";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchDiscoverJerseys } from "@/api/bidding";
import { resolvePhotoUrl } from "@/api/collection";
import { useAuth } from "@/auth/AuthProvider";
import { SearchField } from "@/components/catalog-ui";
import { JerseyTile } from "@/components/jersey-tile";
import { ScreenHeader } from "@/components/screen-header";
import { EmptyState } from "@/components/ui";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export default function SearchScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { width } = useWindowDimensions();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarPadding =
    space.insetLg * 2 +
    space.insetMd +
    space.insetLg +
    space.insetSm +
    insets.bottom +
    space.insetMd;
  const [loading, setLoading] = useState(true);
  const [jerseys, setJerseys] = useState<CollectionDiscoverJersey[]>([]);
  const [query, setQuery] = useState("");

  const loadDiscover = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const response = await fetchDiscoverJerseys(accessToken, query);
    setJerseys(response.jerseys);
  }, [accessToken, query]);

  useEffect(() => {
    let active = true;

    async function run() {
      if (!accessToken) {
        return;
      }

      setLoading(true);
      try {
        await loadDiscover();
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
  }, [accessToken, loadDiscover]);

  const columnGap = space.gapMd;
  const horizontalPadding = space.insetMd * 2;
  const tileWidth = (width - horizontalPadding - columnGap) / 2;

  const openSendBid = (jerseyId: string) => {
    router.push(`/(tabs)/search/send-bid/${jerseyId}`);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.canvas }]}>
      <ScreenHeader title="Søg" />
      <View style={styles.searchWrapper}>
        <SearchField
          variant="collection"
          value={query}
          onChangeText={setQuery}
          placeholder="Søg efter klub eller sæson"
          accessibilityLabel="Søg efter klub eller sæson"
          onClear={() => setQuery("")}
        />
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.fillPrimary} />
        </View>
      ) : jerseys.length === 0 ? (
        <EmptyState
          title="Ingen trøjer åbne for bud"
          body="Når andre samlere slår bud til på en trøje, kan du finde den her."
        />
      ) : (
        <FlatList
          data={jerseys}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={[styles.gridContent, { paddingBottom: tabBarPadding }]}
          renderItem={({ item }) => {
            const primaryPhoto = item.photos[0];
            const photoSource = primaryPhoto
              ? {
                  uri: resolvePhotoUrl(primaryPhoto.photoUrl),
                  headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
                }
              : undefined;

            return (
              <View style={{ width: tileWidth }}>
                <JerseyTile
                  photoSource={photoSource}
                  clubLabel={item.clubLabel}
                  seasonLabel={item.seasonLabel}
                  typeLabel={KIT_TYPE_LABELS_DA[item.type]}
                  onPress={() => openSendBid(item.id)}
                />
              </View>
            );
          }}
        />
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
  gridContent: {
    paddingHorizontal: space.insetMd,
    gap: space.gapMd,
  },
  row: {
    gap: space.gapMd,
  },
});
