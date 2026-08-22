import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { fetchCollectionJerseys, resolvePhotoUrl } from "@/api/collection";
import { useAuth } from "@/auth/AuthProvider";
import { JerseyTile } from "@/components/jersey-tile";
import { Button, EmptyState } from "@/components/ui";
import { color, space, type } from "@/theme/tokens";
import type { CollectionJersey } from "@kit/api-contract";

export default function CollectionScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [jerseys, setJerseys] = useState<CollectionJersey[]>([]);

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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={color.fillPrimary} />
      </View>
    );
  }

  if (jerseys.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Samling</Text>
        <EmptyState
          title="Ingen trøjer endnu"
          body="Tilføj din første trøje for at starte samlingen."
          action={
            <Button
              label="Tilføj trøje"
              variant="primary"
              onPress={() => router.push("/(tabs)/add")}
            />
          }
        />
      </View>
    );
  }

  const columnGap = space.gapMd;
  const horizontalPadding = space.insetMd * 2;
  const tileWidth = (width - horizontalPadding - columnGap) / 2;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Samling</Text>
      <FlatList
        data={jerseys}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.gridContent}
        renderItem={({ item }) => {
          const primaryPhoto = item.photos[0];
          const photoSource = primaryPhoto
            ? {
                uri: resolvePhotoUrl(primaryPhoto.photoUrl),
                headers: accessToken
                  ? { Authorization: `Bearer ${accessToken}` }
                  : undefined,
              }
            : undefined;

          return (
            <View style={{ width: tileWidth }}>
              <JerseyTile
                photoSource={photoSource}
                clubLabel={item.clubLabel}
                seasonLabel={item.seasonLabel}
              />
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.canvas,
    padding: space.insetMd,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.canvas,
  },
  title: {
    fontSize: type.title.fontSize,
    lineHeight: type.title.lineHeight,
    fontWeight: type.title.fontWeight,
    color: color.contentPrimary,
    marginBottom: space.insetMd,
  },
  gridContent: {
    gap: space.gapMd,
  },
  row: {
    gap: space.gapMd,
  },
});
