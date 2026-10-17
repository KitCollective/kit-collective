import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { fetchDiscoverJerseys } from "@/api/bidding";
import { useAuth } from "@/auth/AuthProvider";
import { JerseyTile } from "@/components/jersey-tile";
import { DrillHeader } from "@/components/profile-ui";
import { EmptyState } from "@/components/ui";
import { searchTilePhotoSource } from "@/search/search-tile-photo";
import { buildSearchTile, type SearchTile } from "@/search/search-view-model";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

/**
 * Se alle on the Søg home's Åbne for bud shelf: every jersey open for bid, as the same
 * two-column Jersey tile grid as Samling. The caption is the shelf's caption.
 */
export function OpenForBidScreen({ contentPaddingBottom }: { contentPaddingBottom: number }) {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { width } = useWindowDimensions();
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [tiles, setTiles] = useState<SearchTile[]>([]);

  useEffect(() => {
    let active = true;

    async function run() {
      if (!accessToken) {
        return;
      }
      try {
        const response = await fetchDiscoverJerseys(accessToken);
        if (active) {
          setTiles(response.jerseys.map(buildSearchTile));
        }
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
  }, [accessToken]);

  const tileWidth = (width - space.insetMd * 2 - space.gapMd) / 2;

  return (
    <View testID="open-for-bid-list" style={[styles.container, { backgroundColor: theme.canvas }]}>
      <DrillHeader title="Åbne for bud" onBack={() => router.back()} />
      {loading ? (
        <ActivityIndicator color={theme.contentSecondary} style={styles.loading} />
      ) : tiles.length === 0 ? (
        <EmptyState
          title="Ingen trøjer åbne for bud"
          body="Når andre samlere åbner en trøje for bud, vises den her."
        />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: contentPaddingBottom }]}
        >
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
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    marginTop: space.insetLg,
  },
  content: {
    paddingHorizontal: space.insetMd,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.gapMd,
  },
});
