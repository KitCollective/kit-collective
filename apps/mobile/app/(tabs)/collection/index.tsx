import type { CollectionJersey } from "@kit/api-contract";
import { KIT_TYPE_LABELS_DA } from "@kit/domain";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { fetchCollectionJerseys, resolvePhotoUrl } from "@/api/collection";
import { useAuth } from "@/auth/AuthProvider";
import { CollectionHeader } from "@/components/collection-header";
import { JerseyTile } from "@/components/jersey-tile";
import { Sheet } from "@/components/catalog-ui";
import { ShortcutChipRow, useTabBarContentPadding } from "@/components/shortcut-chip-row";
import { Button, ButtonDock, EmptyState } from "@/components/ui";
import { useTheme } from "@/theme/use-theme";
import { space, type } from "@/theme/tokens";

export default function CollectionScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { width } = useWindowDimensions();
  const theme = useTheme();
  const tabBarPadding = useTabBarContentPadding();
  const [loading, setLoading] = useState(true);
  const [jerseys, setJerseys] = useState<CollectionJersey[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

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

  const openJerseyDetail = (jerseyId: string) => {
    router.push(`/(tabs)/collection/${jerseyId}`);
  };

  const startCapture = () => {
    router.push("/(tabs)/add/capture");
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.canvas }]}>
        <ActivityIndicator color={theme.fillPrimary} />
      </View>
    );
  }

  if (jerseys.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: theme.canvas }]}>
        <CollectionHeader count={0} onNotificationsPress={() => setNotificationsOpen(true)} />
        <EmptyState title="Ingen trøjer endnu" body="Tilføj den første fra galleriet." />
        <ButtonDock>
          <Button label="Tilføj trøje" variant="primary" width="fill" onPress={startCapture} />
        </ButtonDock>
        <Sheet visible={notificationsOpen} title="Notifikationer" onDismiss={() => setNotificationsOpen(false)}>
          <Text style={[styles.notificationBody, { color: theme.contentSecondary }]}>
            Ingen notifikationer
          </Text>
        </Sheet>
      </View>
    );
  }

  const columnGap = space.gapMd;
  const horizontalPadding = space.insetMd * 2;
  const tileWidth = (width - horizontalPadding - columnGap) / 2;

  return (
    <View style={[styles.container, { backgroundColor: theme.canvas }]}>
      <CollectionHeader
        count={jerseys.length}
        onNotificationsPress={() => setNotificationsOpen(true)}
      />
      <ShortcutChipRow selectedShortcutId={null} onSelectAlle={() => undefined} />
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
                onPress={() => openJerseyDetail(item.id)}
              />
            </View>
          );
        }}
      />
      <Sheet visible={notificationsOpen} title="Notifikationer" onDismiss={() => setNotificationsOpen(false)}>
        <Text style={[styles.notificationBody, { color: theme.contentSecondary }]}>
          Ingen notifikationer
        </Text>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
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
  notificationBody: {
    fontFamily: type.body.fontFamily,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
});
