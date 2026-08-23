import type { CollectionJersey } from "@kit/api-contract";
import { KIT_TYPE_LABELS_DA } from "@kit/domain";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, useWindowDimensions, View } from "react-native";
import { fetchCollectionJerseys, resolvePhotoUrl } from "@/api/collection";
import { useAuth } from "@/auth/AuthProvider";
import { SearchField } from "@/components/catalog-ui";
import { JerseyTile } from "@/components/jersey-tile";
import { ScreenHeader } from "@/components/screen-header";
import { useTabBarContentPadding } from "@/components/shortcut-chip-row";
import { EmptyState } from "@/components/ui";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

function matchesQuery(jersey: CollectionJersey, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const typeLabel = KIT_TYPE_LABELS_DA[jersey.type].toLowerCase();
  const haystack = `${jersey.clubLabel} ${jersey.seasonLabel} ${typeLabel}`.toLowerCase();
  return haystack.includes(normalized);
}

export default function SearchScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { width } = useWindowDimensions();
  const theme = useTheme();
  const tabBarPadding = useTabBarContentPadding();
  const [loading, setLoading] = useState(true);
  const [jerseys, setJerseys] = useState<CollectionJersey[]>([]);
  const [query, setQuery] = useState("");

  const loadCollection = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const response = await fetchCollectionJerseys(accessToken);
    setJerseys(response.jerseys);
  }, [accessToken]);

  useEffect(() => {
    let active = true;

    async function run() {
      if (!accessToken) {
        return;
      }

      try {
        await loadCollection();
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
  }, [accessToken, loadCollection]);

  const filteredJerseys = useMemo(
    () => jerseys.filter((jersey) => matchesQuery(jersey, query)),
    [jerseys, query],
  );

  const columnGap = space.gapMd;
  const horizontalPadding = space.insetMd * 2;
  const tileWidth = (width - horizontalPadding - columnGap) / 2;

  const openJerseyDetail = (jerseyId: string) => {
    router.push(`/(tabs)/collection/${jerseyId}`);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.canvas }]}>
      <ScreenHeader title="Søg" />
      <View style={styles.searchWrapper}>
        <SearchField
          variant="collection"
          value={query}
          onChangeText={setQuery}
          placeholder="Søg i din samling"
          accessibilityLabel="Søg i din samling"
          onClear={() => setQuery("")}
        />
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.fillPrimary} />
        </View>
      ) : jerseys.length === 0 ? (
        <EmptyState title="Ingen trøjer at søge i" body="Tilføj trøjer til din samling først." />
      ) : filteredJerseys.length === 0 ? (
        <EmptyState title="Ingen resultater" body="Prøv et andet søgeord." />
      ) : (
        <FlatList
          data={filteredJerseys}
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
                  onPress={() => openJerseyDetail(item.id)}
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
