import type { CollectionFavoriteItem } from "@kit/api-contract";
import { KIT_TYPE_LABELS_DA } from "@kit/domain";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolvePhotoUrl } from "@/api/collection";
import { fetchFavorites } from "@/api/favorites";
import { useAuth } from "@/auth/AuthProvider";
import { JerseyTile } from "@/components/jersey-tile";
import { DrillHeader } from "@/components/profile-ui";
import { EmptyState } from "@/components/ui";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export default function FavoritesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { accessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<CollectionFavoriteItem[]>([]);

  const loadFavorites = useCallback(async () => {
    if (!accessToken) {
      setFavorites([]);
      return;
    }

    const response = await fetchFavorites(accessToken);
    setFavorites(response.favorites);
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function run() {
        setLoading(true);
        try {
          await loadFavorites();
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
    }, [loadFavorites]),
  );

  const columnGap = space.gapMd;
  const horizontalPadding = space.insetMd * 2;
  const tileWidth = (width - horizontalPadding - columnGap) / 2;

  const openPeerDetail = (userJerseyId: string) => {
    router.push(`/(tabs)/search/${userJerseyId}`);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.fillSecondary }]}>
      <View style={{ paddingTop: insets.top }}>
        <DrillHeader title="Favoritter" onBack={() => router.back()} />
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.fillPrimary} />
        </View>
      ) : favorites.length === 0 ? (
        <EmptyState
          title="Ingen favoritter endnu"
          body="Når du gemmer en anden collectors trøje fra Søg, dukker den op her."
        />
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item) => item.userJerseyId}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.gridContent}
          renderItem={({ item }) => (
            <View style={{ width: tileWidth }}>
              <JerseyTile
                photoSource={{
                  uri: resolvePhotoUrl(item.photoUrl),
                  headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
                }}
                clubLabel={item.clubLabel}
                seasonLabel={item.seasonLabel}
                typeLabel={KIT_TYPE_LABELS_DA[item.type]}
                onPress={() => openPeerDetail(item.userJerseyId)}
              />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: space.insetMd,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  gridContent: {
    gap: space.gapMd,
    paddingBottom: space.insetLg,
  },
  row: {
    gap: space.gapMd,
  },
});
