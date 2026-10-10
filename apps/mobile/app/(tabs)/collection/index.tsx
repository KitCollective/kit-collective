import { Ionicons } from "@expo/vector-icons";
import type { CollectionJersey, CollectionShortcut } from "@kit/api-contract";
import { KIT_TYPE_LABELS_DA } from "@kit/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { CollectionFetchError, fetchCollectionJerseys, resolvePhotoUrl } from "@/api/collection";
import { fetchCollectionShortcuts } from "@/api/shortcuts";
import { useAuth } from "@/auth/AuthProvider";
import { useCaptureChooser } from "@/capture/capture-chooser";
import { CollectionEmptyDiagram } from "@/components/collection-empty-diagram";
import { CollectionHeader } from "@/components/collection-header";
import { ShortcutsSheet } from "@/components/genveje-sheet";
import { shouldFallbackToAlleOnFetchError } from "@/components/genveje-sheet-logic";
import { JerseyTile } from "@/components/jersey-tile";
import { ParkedSessionRow } from "@/components/parked-session-row";
import { ShortcutChipRow } from "@/components/shortcut-chip-row";
import { tabBarContentInset } from "@/components/tab-bar-metrics";
import { Button, EmptyState } from "@/components/ui";
import { FIRST_ARRIVAL_NOTE, FIRST_ARRIVAL_SLOT_LABEL } from "@/first-session/first-arrival-copy";
import { RESULT_COLLECTION_BUD_CAPTION } from "@/first-session/jersey-details-copy";
import { registerPlaceHome, useIsPlaceHomeLive } from "@/navigation/place-homes";
import { readPlaceOverview, writePlaceOverview } from "@/navigation/place-overview-cache";
import { PlacePagerScreen } from "@/navigation/place-pager-screen";
import { usePlaceOverview } from "@/navigation/use-place-overview";
import {
  dismissProfilePrompt,
  nextProfilePromptState,
  type ProfilePromptState,
  readProfilePromptState,
  shouldShowProfilePrompt,
  storeProfilePromptState,
} from "@/profile-prompt/dismissal";
import { ProfilePrompt } from "@/profile-prompt/profile-prompt";
import { securePromptStore } from "@/profile-prompt/secure-prompt-store";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useStableSafeAreaInsets } from "@/theme/use-stable-safe-area-insets";
import { useTheme } from "@/theme/use-theme";

export default function CollectionScreen() {
  return <PlacePagerScreen place="collection" />;
}

function CollectionHome() {
  const router = useRouter();
  const { firstSessionResult, firstSessionArrival, firstSessionSaved } = useLocalSearchParams<{
    firstSessionResult?: string;
    firstSessionSaved?: string;
    firstSessionArrival?: string;
  }>();
  const showResultCollectionCaption = firstSessionResult === "1";
  const savedInFirstSession = Number.parseInt(firstSessionSaved ?? "0", 10) || 0;
  const isFirstArrival = firstSessionArrival === "1";
  const { accessToken, requestPremiumAccess, user } = useAuth();
  const userId = user?.id ?? null;
  // True only after a live fetch of the collection succeeded: a failed fetch is not an empty one.
  const [collectionLoaded, setCollectionLoaded] = useState(false);
  const [profilePromptState, setProfilePromptState] = useState<ProfilePromptState | null>(null);
  const captureChooser = useCaptureChooser();
  const { width } = useWindowDimensions();
  const theme = useTheme();
  const typography = useTypography();
  const insets = useStableSafeAreaInsets();
  const tabBarPadding = tabBarContentInset(insets.bottom);
  const cachedCollection = usePlaceOverview("collection");
  const isLive = useIsPlaceHomeLive("collection");
  const [loading, setLoading] = useState(cachedCollection == null);
  const [jerseys, setJerseys] = useState<CollectionJersey[]>(cachedCollection?.jerseys ?? []);
  const [allJerseys, setAllJerseys] = useState<CollectionJersey[]>(
    cachedCollection?.allJerseys ?? [],
  );
  const [totalJerseyCount, setTotalJerseyCount] = useState(cachedCollection?.totalJerseyCount ?? 0);
  const [shortcuts, setShortcuts] = useState<CollectionShortcut[]>(
    cachedCollection?.shortcuts ?? [],
  );
  const [selectedShortcutId, setSelectedShortcutId] = useState<string | null>(null);
  const [genvejeOpen, setGenvejeOpen] = useState(false);
  const hasInitialLoadRef = useRef(cachedCollection != null);

  useEffect(() => {
    if (!cachedCollection || selectedShortcutId != null) {
      return;
    }
    setJerseys(cachedCollection.jerseys);
    setAllJerseys(cachedCollection.allJerseys);
    setTotalJerseyCount(cachedCollection.totalJerseyCount);
    setShortcuts(cachedCollection.shortcuts);
    setLoading(false);
    hasInitialLoadRef.current = true;
  }, [cachedCollection, selectedShortcutId]);

  const loadCollection = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    try {
      const response = await fetchCollectionJerseys(accessToken, selectedShortcutId);
      setJerseys(response.jerseys);

      if (selectedShortcutId === null) {
        setTotalJerseyCount(response.jerseys.length);
        const previous = readPlaceOverview("collection");
        writePlaceOverview("collection", {
          jerseys: response.jerseys,
          allJerseys: previous?.allJerseys ?? response.jerseys,
          totalJerseyCount: response.jerseys.length,
          shortcuts: previous?.shortcuts ?? [],
        });
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
    const previous = readPlaceOverview("collection");
    writePlaceOverview("collection", {
      jerseys: previous?.jerseys ?? response.jerseys,
      allJerseys: response.jerseys,
      totalJerseyCount: response.jerseys.length,
      shortcuts: previous?.shortcuts ?? [],
    });
  }, [accessToken]);

  const loadShortcuts = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const response = await fetchCollectionShortcuts(accessToken);
    setShortcuts(response.shortcuts);
    const previous = readPlaceOverview("collection");
    if (previous) {
      writePlaceOverview("collection", {
        ...previous,
        shortcuts: response.shortcuts,
      });
    }
  }, [accessToken]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadCollection(), loadShortcuts(), loadTotalCount()]);
  }, [loadCollection, loadShortcuts, loadTotalCount]);

  useEffect(() => {
    let active = true;

    async function run() {
      if (!accessToken || !isLive) {
        return;
      }

      try {
        await refreshAll();
        if (active) {
          hasInitialLoadRef.current = true;
          setCollectionLoaded(true);
        }
      } catch {
        // The empty state keeps its existing behaviour; the prompt just does not move.
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
  }, [accessToken, isLive, refreshAll]);

  useEffect(() => {
    if (!accessToken || !isLive || !hasInitialLoadRef.current) {
      return;
    }

    void loadCollection();
  }, [accessToken, isLive, loadCollection]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    let active = true;
    void readProfilePromptState(securePromptStore, userId).then((state) => {
      if (active) {
        setProfilePromptState(state);
      }
    });
    return () => {
      active = false;
    };
  }, [userId]);

  // Samling first seen empty waits for the first jersey; that save (or an arrival with the
  // jersey just saved) arms the prompt. A collection that already had jerseys is never armed.
  useEffect(() => {
    if (!userId || loading) {
      return;
    }
    const next = nextProfilePromptState({
      state: profilePromptState,
      jerseyCount: totalJerseyCount,
      collectionLoaded,
      savedInFirstSession,
    });
    if (!next) {
      return;
    }
    setProfilePromptState(next);
    void storeProfilePromptState(securePromptStore, userId, next);
  }, [
    userId,
    loading,
    profilePromptState,
    totalJerseyCount,
    collectionLoaded,
    savedInFirstSession,
  ]);

  const dismissPrompt = () => {
    setProfilePromptState("dismissed");
    if (userId) {
      void dismissProfilePrompt(securePromptStore, userId);
    }
  };

  const openJerseyDetail = (jerseyId: string) => {
    router.push(`/(tabs)/collection/${jerseyId}`);
  };

  const startCapture = async () => {
    const granted = await requestPremiumAccess();
    if (granted) {
      captureChooser.open();
    }
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
      <View
        style={[
          styles.emptyContainer,
          { backgroundColor: theme.canvas, paddingBottom: tabBarPadding },
        ]}
      >
        <CollectionHeader count={0} onAddPress={() => void startCapture()} />
        <ParkedSessionRow />
        {showResultCollectionCaption ? (
          <Text style={[typography.body, styles.resultCaption, { color: theme.contentMuted }]}>
            {RESULT_COLLECTION_BUD_CAPTION}
          </Text>
        ) : null}
        {isFirstArrival ? (
          <View style={styles.firstArrival}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={FIRST_ARRIVAL_SLOT_LABEL}
              testID="collection-first-slot"
              onPress={() => void startCapture()}
              style={({ pressed }) => [
                styles.firstSlot,
                { borderColor: theme.borderSubtle },
                pressed && { backgroundColor: theme.fillSecondary },
              ]}
            >
              <Ionicons name="add" size={28} color={theme.contentPrimary} />
              <Text style={[typography.label, { color: theme.contentPrimary }]}>
                {FIRST_ARRIVAL_SLOT_LABEL}
              </Text>
            </Pressable>
            <Text
              style={[typography.body, { color: theme.contentMuted, textAlign: "center" }]}
              testID="collection-first-note"
            >
              {FIRST_ARRIVAL_NOTE}
            </Text>
          </View>
        ) : (
          <EmptyState
            title="Ingen trøjer endnu"
            diagram={<CollectionEmptyDiagram />}
            action={
              <Button
                label="Tilføj trøje"
                variant="primary"
                width="hug"
                onPress={() => void startCapture()}
              />
            }
          />
        )}
      </View>
    );
  }

  const columnGap = space.gapMd;
  const horizontalPadding = space.insetMd * 2;
  const tileWidth = (width - horizontalPadding - columnGap) / 2;

  return (
    <View style={[styles.container, { backgroundColor: theme.canvas }]}>
      <CollectionHeader count={totalJerseyCount} onAddPress={() => void startCapture()} />
      {showResultCollectionCaption ? (
        <Text style={[typography.body, styles.resultCaption, { color: theme.contentMuted }]}>
          {RESULT_COLLECTION_BUD_CAPTION}
        </Text>
      ) : null}
      {shouldShowProfilePrompt({
        jerseyCount: totalJerseyCount,
        state: profilePromptState,
      }) ? (
        <ProfilePrompt
          onOpen={() => router.push("/(tabs)/profile/edit")}
          onDismiss={dismissPrompt}
        />
      ) : null}
      <ParkedSessionRow />
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
                uri: resolvePhotoUrl(primaryPhoto.photoUrl, "grid"),
                headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
              }
            : undefined;

          return (
            <View style={{ width: tileWidth }}>
              <JerseyTile
                photoSource={photoSource}
                clubLabel={item.clubLabel ?? item.nationalTeamLabel ?? ""}
                seasonLabel={item.seasonLabel}
                typeLabel={KIT_TYPE_LABELS_DA[item.type]}
                onPress={() => openJerseyDetail(item.id)}
                testID={`jersey-tile-${item.id}`}
              />
            </View>
          );
        }}
      />
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

registerPlaceHome("collection", CollectionHome);

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
  firstArrival: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.gapMd,
    paddingHorizontal: space.insetLg,
  },
  firstSlot: {
    width: "50%",
    aspectRatio: 4 / 5,
    alignItems: "center",
    justifyContent: "center",
    gap: space.gapSm,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: radius.md,
    padding: space.insetMd,
  },
  gridContent: {
    paddingHorizontal: space.insetMd,
    gap: space.gapMd,
  },
  row: {
    gap: space.gapMd,
  },
});
