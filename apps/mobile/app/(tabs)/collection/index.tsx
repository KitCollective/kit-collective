import type { CollectionJersey, CollectionShortcut } from "@kit/api-contract";
import { KIT_TYPE_LABELS_DA } from "@kit/domain";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchCollectionJerseys, resolvePhotoUrl } from "@/api/collection";
import { fetchCollectionShortcuts } from "@/api/shortcuts";
import { useAuth } from "@/auth/AuthProvider";
import { Sheet } from "@/components/catalog-ui";
import { CollectionHeader } from "@/components/collection-header";
import { GenvejeSheet } from "@/components/genveje-sheet";
import { JerseyTile } from "@/components/jersey-tile";
import { ShortcutChipRow } from "@/components/shortcut-chip-row";
import { Button, ButtonDock, EmptyState } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export default function CollectionScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { width } = useWindowDimensions();
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const tabBarPadding =
    space.insetLg * 2 +
    space.insetMd +
    space.insetLg +
    space.insetSm +
    insets.bottom +
    space.insetMd;
  const [loading, setLoading] = useState(true);
  const [jerseys, setJerseys] = useState<CollectionJersey[]>([]);
  const [totalJerseyCount, setTotalJerseyCount] = useState(0);
  const [shortcuts, setShortcuts] = useState<CollectionShortcut[]>([]);
  const [selectedShortcutId, setSelectedShortcutId] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [genvejeOpen, setGenvejeOpen] = useState(false);
  const hasInitialLoadRef = useRef(false);

  const loadCollection = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const response = await fetchCollectionJerseys(accessToken, selectedShortcutId);
    setJerseys(response.jerseys);

    if (selectedShortcutId === null) {
      setTotalJerseyCount(response.jerseys.length);
    }
  }, [accessToken, selectedShortcutId]);

  const loadTotalCount = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const response = await fetchCollectionJerseys(accessToken, null);
    setTotalJerseyCount(response.jerseys.length);
  }, [accessToken]);

  const loadShortcuts = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const response = await fetchCollectionShortcuts(accessToken);
    setShortcuts(response.shortcuts);
  }, [accessToken]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadCollection(), loadShortcuts(), loadTotalCount()]);
  }, [loadCollection, loadShortcuts, loadTotalCount]);

  useEffect(() => {
    let active = true;

    async function run() {
      if (!accessToken) {
        return;
      }

      try {
        await refreshAll();
        if (active) {
          hasInitialLoadRef.current = true;
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
  }, [accessToken, refreshAll]);

  useEffect(() => {
    if (!accessToken || !hasInitialLoadRef.current) {
      return;
    }

    void loadCollection();
  }, [accessToken, selectedShortcutId, loadCollection]);

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

  if (totalJerseyCount === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: theme.canvas }]}>
        <CollectionHeader count={0} onNotificationsPress={() => setNotificationsOpen(true)} />
        <EmptyState title="Ingen trøjer endnu" body="Tilføj den første fra galleriet." />
        <ButtonDock>
          <Button label="Tilføj trøje" variant="primary" width="fill" onPress={startCapture} />
        </ButtonDock>
        <Sheet
          visible={notificationsOpen}
          title="Notifikationer"
          onDismiss={() => setNotificationsOpen(false)}
        >
          <Text style={[typography.body, { color: theme.contentSecondary }]}>
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
        count={totalJerseyCount}
        onNotificationsPress={() => setNotificationsOpen(true)}
      />
      <ShortcutChipRow
        shortcuts={shortcuts}
        selectedShortcutId={selectedShortcutId}
        onSelectAlle={() => setSelectedShortcutId(null)}
        onSelectShortcut={(shortcutId) => setSelectedShortcutId(shortcutId)}
        onTilpasPress={() => setGenvejeOpen(true)}
      />
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
      <Sheet
        visible={notificationsOpen}
        title="Notifikationer"
        onDismiss={() => setNotificationsOpen(false)}
      >
        <Text style={[typography.body, { color: theme.contentSecondary }]}>
          Ingen notifikationer
        </Text>
      </Sheet>
      <GenvejeSheet
        visible={genvejeOpen}
        accessToken={accessToken ?? ""}
        onDismiss={() => setGenvejeOpen(false)}
        onShortcutsChanged={() => {
          void refreshAll();
        }}
      />
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
});
