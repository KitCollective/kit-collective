import type { CollectionJersey, CollectionShortcut } from "@kit/api-contract";
import { KIT_TYPE_LABELS_DA } from "@kit/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { CollectionFetchError, fetchCollectionJerseys, resolvePhotoUrl } from "@/api/collection";
import { fetchCollectionShortcuts } from "@/api/shortcuts";
import { useAuth } from "@/auth/AuthProvider";
import { CollectionHeader } from "@/components/collection-header";
import { ShortcutsSheet } from "@/components/genveje-sheet";
import { shouldFallbackToAlleOnFetchError } from "@/components/genveje-sheet-logic";
import { JerseyTile } from "@/components/jersey-tile";
import { ShortcutChipRow } from "@/components/shortcut-chip-row";
import { Button, ButtonDock, EmptyState } from "@/components/ui";
import { WishlistSheet } from "@/components/wishlist-sheet";
import { RESULT_SAMLING_BUD_CAPTION } from "@/first-session/jersey-details-copy";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export default function CollectionScreen() {
  const router = useRouter();
  const { firstSessionResult } = useLocalSearchParams<{ firstSessionResult?: string }>();
  const showResultSamlingCaption = firstSessionResult === "1";
  const { accessToken, requestPremiumAccess } = useAuth();
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
  const [allJerseys, setAllJerseys] = useState<CollectionJersey[]>([]);
  const [totalJerseyCount, setTotalJerseyCount] = useState(0);
  const [shortcuts, setShortcuts] = useState<CollectionShortcut[]>([]);
  const [selectedShortcutId, setSelectedShortcutId] = useState<string | null>(null);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [genvejeOpen, setGenvejeOpen] = useState(false);
  const hasInitialLoadRef = useRef(false);

  const loadCollection = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    try {
      const response = await fetchCollectionJerseys(accessToken, selectedShortcutId);
      setJerseys(response.jerseys);

      if (selectedShortcutId === null) {
        setTotalJerseyCount(response.jerseys.length);
      }
    } catch (error) {
      if (
        error instanceof CollectionFetchError &&
        shouldFallbackToAlleOnFetchError(error.status, selectedShortcutId)
      ) {
        setSelectedShortcutId(null);
        return;
      }

      throw error;
    }
  }, [accessToken, selectedShortcutId]);

  const loadTotalCount = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const response = await fetchCollectionJerseys(accessToken, null);
    setTotalJerseyCount(response.jerseys.length);
    setAllJerseys(response.jerseys);
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
  }, [accessToken, loadCollection]);

  const openJerseyDetail = (jerseyId: string) => {
    router.push(`/(tabs)/collection/${jerseyId}`);
  };

  const startCapture = async () => {
    const granted = await requestPremiumAccess();
    if (granted) {
      router.push("/(tabs)/add/capture");
    }
  };

  const openWishlist = () => {
    setWishlistOpen(true);
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
        <CollectionHeader count={0} onWishlistPress={() => void openWishlist()} />
        {showResultSamlingCaption ? (
          <Text style={[typography.body, styles.resultCaption, { color: theme.contentMuted }]}>
            {RESULT_SAMLING_BUD_CAPTION}
          </Text>
        ) : null}
        <EmptyState title="Ingen trøjer endnu" body="Tilføj den første fra galleriet." />
        <ButtonDock>
          <Button
            label="Tilføj trøje"
            variant="primary"
            width="fill"
            onPress={() => void startCapture()}
          />
        </ButtonDock>
        <WishlistSheet visible={wishlistOpen} onDismiss={() => setWishlistOpen(false)} />
      </View>
    );
  }

  const columnGap = space.gapMd;
  const horizontalPadding = space.insetMd * 2;
  const tileWidth = (width - horizontalPadding - columnGap) / 2;

  return (
    <View style={[styles.container, { backgroundColor: theme.canvas }]}>
      <CollectionHeader count={totalJerseyCount} onWishlistPress={() => void openWishlist()} />
      {showResultSamlingCaption ? (
        <Text style={[typography.body, styles.resultCaption, { color: theme.contentMuted }]}>
          {RESULT_SAMLING_BUD_CAPTION}
        </Text>
      ) : null}
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
      <WishlistSheet visible={wishlistOpen} onDismiss={() => setWishlistOpen(false)} />
      <ShortcutsSheet
        visible={genvejeOpen}
        accessToken={accessToken ?? ""}
        activeShortcutId={selectedShortcutId}
        ownerJerseys={allJerseys}
        onDismiss={() => setGenvejeOpen(false)}
        onShortcutDeleted={() => setSelectedShortcutId(null)}
        onShortcutSaved={() => setSelectedShortcutId(null)}
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
  resultCaption: {
    paddingHorizontal: space.insetMd,
    paddingBottom: space.insetSm,
  },
  gridContent: {
    paddingHorizontal: space.insetMd,
    gap: space.gapMd,
  },
  row: {
    gap: space.gapMd,
  },
});
