import type { CollectionJersey } from "@kit/api-contract";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { patchJerseyBidding, patchJerseyPrivate } from "@/api/bidding";
import {
  addUserJerseyPhoto,
  deleteUserJersey,
  fetchCollectionJerseys,
  resolvePhotoUrl,
} from "@/api/collection";
import { useAuth } from "@/auth/AuthProvider";
import { createEditCaptureSession } from "@/capture/captureSession";
import { createSqliteCaptureSessionStore } from "@/capture/captureSessionSqliteStore";
import { expoGalleryPickerAdapter } from "@/capture/expoPickerAdapters";
import { captureQualityForRole, readPreparedPhotoBase64 } from "@/capture/photoBytes";
import { pickGalleryPhotos } from "@/capture/pickGalleryPhotos";
import { Banner } from "@/components/catalog-ui";
import { formatThreadTime } from "@/components/thread-row";
import { IconButton } from "@/components/ui";
import {
  JerseyBidRow,
  JerseyFactRow,
  JerseyPlayerRow,
  JerseySwitchRow,
  JerseyTitleBlock,
} from "@/jersey-detail/jersey-detail-rows";
import { JerseyDeleteConfirmSheet, JerseyMoreSheet } from "@/jersey-detail/jersey-detail-sheets";
import {
  type BidRowTarget,
  buildJerseyDetailView,
  canAddJerseyPhoto,
  JERSEY_PHOTO_ADD_ERROR,
  jerseySettingsView,
  replaceJerseyInList,
} from "@/jersey-detail/jersey-detail-view-model";
import { JerseyPhotoPager, JerseyThumbStrip } from "@/jersey-detail/jersey-photos";
import { readPlaceOverview, writePlaceOverview } from "@/navigation/place-overview-cache";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type PendingMoreAction = "edit" | "delete";

const PICKED_PHOTO_ROLE = "other";

export default function JerseyDetailScreen() {
  const { jerseyId } = useLocalSearchParams<{ jerseyId: string }>();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const { accessToken } = useAuth();
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<ScrollView>(null);
  const pendingMoreAction = useRef<PendingMoreAction | null>(null);

  const [loading, setLoading] = useState(true);
  const [jersey, setJersey] = useState<CollectionJersey | null>(null);
  // The owner's full list, createdAt desc (no shortcut filter): the ordinal n comes from it.
  const [list, setList] = useState<CollectionJersey[]>([]);
  const [biddingEnabled, setBiddingEnabled] = useState(false);
  const [savingBidding, setSavingBidding] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [savingPrivate, setSavingPrivate] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingPhoto, setAddingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // Set when a photo was just added: the pager jumps to the new (last) photo once it is rendered.
  const jumpToNewPhoto = useRef(false);

  const loadJersey = useCallback(async () => {
    if (!accessToken || !jerseyId) {
      return;
    }

    const response = await fetchCollectionJerseys(accessToken);
    const found = response.jerseys.find((item) => item.id === jerseyId) ?? null;
    setList(response.jerseys);
    setJersey(found);
    setBiddingEnabled(found?.biddingEnabled ?? false);
    setIsPrivate(found?.private ?? false);
    setPhotoIndex(0);
  }, [accessToken, jerseyId]);

  useEffect(() => {
    let active = true;

    async function run() {
      try {
        await loadJersey();
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
  }, [loadJersey]);

  const toggleBidding = async (nextValue: boolean) => {
    if (!accessToken || !jerseyId) {
      return;
    }

    setBiddingEnabled(nextValue);
    setSavingBidding(true);
    try {
      const updated = await patchJerseyBidding(accessToken, jerseyId, {
        biddingEnabled: nextValue,
      });
      setBiddingEnabled(updated.biddingEnabled);
    } catch {
      setBiddingEnabled(!nextValue);
    } finally {
      setSavingBidding(false);
    }
  };

  const togglePrivate = async (nextValue: boolean) => {
    if (!accessToken || !jerseyId) {
      return;
    }

    setIsPrivate(nextValue);
    setSavingPrivate(true);
    try {
      const updated = await patchJerseyPrivate(accessToken, jerseyId, { private: nextValue });
      setIsPrivate(updated.private);
      setBiddingEnabled(updated.biddingEnabled);
    } catch {
      setIsPrivate(!nextValue);
    } finally {
      setSavingPrivate(false);
    }
  };

  const handleEdit = () => {
    if (!jersey) {
      return;
    }

    const sessionId =
      typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `edit-${Date.now()}`;
    const store = createSqliteCaptureSessionStore(sessionId);
    createEditCaptureSession(jersey, sessionId, store);
    router.push({
      pathname: "/(capture)/confirm",
      params: { sessionId, editJerseyId: jersey.id },
    });
  };

  // Samling's place-overview cache only refetches when the place goes live again: a jersey it
  // holds gets its new photo list, so the tile and the count there stay true.
  const syncCollectionCache = (updated: CollectionJersey) => {
    const previous = readPlaceOverview("collection");
    if (!previous) {
      return;
    }
    writePlaceOverview("collection", {
      ...previous,
      jerseys: replaceJerseyInList(previous.jerseys, updated),
      allJerseys: replaceJerseyInList(previous.allJerseys, updated),
    });
  };

  const handleAddPhoto = async () => {
    if (!accessToken || !jersey || addingPhoto) {
      return;
    }

    setPhotoError(null);
    try {
      const uris = await pickGalleryPhotos(
        { quality: captureQualityForRole(PICKED_PHOTO_ROLE) },
        expoGalleryPickerAdapter,
      );
      const uri = uris?.[0];
      if (!uri) {
        return;
      }

      setAddingPhoto(true);
      const contentBase64 = await readPreparedPhotoBase64(uri, PICKED_PHOTO_ROLE, "display");
      const updated = await addUserJerseyPhoto(accessToken, jersey.id, {
        role: PICKED_PHOTO_ROLE,
        source: "gallery",
        contentBase64,
      });
      jumpToNewPhoto.current = true;
      setJersey(updated);
      setList((current) => replaceJerseyInList(current, updated));
      syncCollectionCache(updated);
    } catch {
      setPhotoError(JERSEY_PHOTO_ADD_ERROR);
    } finally {
      setAddingPhoto(false);
    }
  };

  // Samling keeps a place-overview cache that only refetches when the place goes live again;
  // drop the deleted jersey from it so Samling never shows it.
  const dropFromCollectionCache = (deletedId: string) => {
    const previous = readPlaceOverview("collection");
    if (!previous) {
      return;
    }
    writePlaceOverview("collection", {
      ...previous,
      jerseys: previous.jerseys.filter((item) => item.id !== deletedId),
      allJerseys: previous.allJerseys.filter((item) => item.id !== deletedId),
      totalJerseyCount: Math.max(0, previous.totalJerseyCount - 1),
    });
  };

  const handleDelete = async () => {
    if (!accessToken || !jerseyId) {
      return;
    }

    setDeleting(true);
    try {
      await deleteUserJersey(accessToken, jerseyId);
      dropFromCollectionCache(jerseyId);
      setDeleteSheetOpen(false);
      router.replace("/(tabs)/collection");
    } catch {
      setDeleteSheetOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  // The More sheet closes first; on iOS the next surface (the capture route or the confirm
  // Sheet) waits for Modal.onDismiss so it does not layer over a closing Modal.
  const runPendingMoreAction = () => {
    const next = pendingMoreAction.current;
    pendingMoreAction.current = null;
    if (next === "edit") {
      handleEdit();
    } else if (next === "delete") {
      setDeleteSheetOpen(true);
    }
  };

  const chooseMoreAction = (action: PendingMoreAction) => {
    setMoreOpen(false);
    pendingMoreAction.current = action;
    if (Platform.OS !== "ios") {
      runPendingMoreAction();
    }
  };

  const openBidTarget = (target: BidRowTarget) => {
    if (target.kind === "thread") {
      router.push(`/(tabs)/inbox/${target.conversationId}`);
      return;
    }
    // Several bidders: Indbakke opens filtered to this jersey (it reads the `jerseyId` param).
    router.push({ pathname: "/(tabs)/inbox", params: { jerseyId: target.jerseyId } });
  };

  const selectPhoto = (index: number) => {
    setPhotoIndex(index);
    pagerRef.current?.scrollTo({ x: index * screenWidth, animated: true });
  };

  const photoCount = jersey?.photos.length ?? 0;
  useEffect(() => {
    if (!jumpToNewPhoto.current || photoCount === 0) {
      return;
    }
    jumpToNewPhoto.current = false;
    const lastIndex = photoCount - 1;
    setPhotoIndex(lastIndex);
    // After the frame that lays out the new page, so the offset is not clamped to the old width.
    requestAnimationFrame(() => {
      pagerRef.current?.scrollTo({ x: lastIndex * screenWidth, animated: true });
    });
  }, [photoCount, screenWidth]);

  const view = useMemo(
    () => (jersey ? buildJerseyDetailView({ jersey, list, formatTime: formatThreadTime }) : null),
    [jersey, list],
  );
  const settings = jerseySettingsView({ biddingEnabled, isPrivate, savingBidding, savingPrivate });

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.canvas }]}>
        <ActivityIndicator color={theme.fillPrimary} />
      </View>
    );
  }

  if (!jersey || !view) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.canvas }]}>
        <Text style={[typography.body, { color: theme.contentSecondary }]}>Trøjen findes ikke</Text>
        <IconButton name="Tilbage" icon="arrow-back" onPress={() => router.back()} />
      </View>
    );
  }

  const bidRow = view.bidRow;

  return (
    <View testID="jersey-detail-own" style={[styles.root, { backgroundColor: theme.canvas }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + space.insetLg }}
        showsVerticalScrollIndicator={false}
      >
        <JerseyPhotoPager
          pagerRef={pagerRef}
          photos={jersey.photos}
          photoUris={jersey.photos.map((photo) => resolvePhotoUrl(photo.photoUrl, "lightbox"))}
          title={view.title}
          accessToken={accessToken}
          index={photoIndex}
          onIndexChange={setPhotoIndex}
          onBack={() => router.back()}
          onMore={() => setMoreOpen(true)}
        />
        <JerseyThumbStrip
          photos={jersey.photos}
          accessToken={accessToken}
          index={photoIndex}
          onSelect={selectPhoto}
          canAddPhoto={canAddJerseyPhoto(jersey.photos.length)}
          addingPhoto={addingPhoto}
          onAddPhoto={() => void handleAddPhoto()}
        />

        <View style={styles.column}>
          {photoError ? <Banner tone="danger" message={photoError} /> : null}
          <JerseyTitleBlock caption={view.caption} title={view.title} season={view.season} />

          {bidRow ? (
            <JerseyBidRow row={bidRow} onPress={() => openBidTarget(bidRow.target)} />
          ) : null}

          <JerseyPlayerRow row={view.playerRow} />

          <View>
            {view.factRows.map((row, index) => (
              <JerseyFactRow key={row.key} row={row} hairline={index < view.factRows.length - 1} />
            ))}
          </View>

          <View>
            <JerseySwitchRow
              row={settings.bidding}
              onValueChange={(value) => void toggleBidding(value)}
              testID="jersey-detail-bidding"
            />
            <JerseySwitchRow
              row={settings.private}
              onValueChange={(value) => void togglePrivate(value)}
              testID="jersey-detail-private"
            />
          </View>
        </View>
      </ScrollView>

      <JerseyMoreSheet
        visible={moreOpen}
        onDismiss={() => {
          pendingMoreAction.current = null;
          setMoreOpen(false);
        }}
        onModalHide={runPendingMoreAction}
        onEdit={() => chooseMoreAction("edit")}
        onDelete={() => chooseMoreAction("delete")}
      />

      <JerseyDeleteConfirmSheet
        visible={deleteSheetOpen}
        jersey={jersey}
        accessToken={accessToken}
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onDismiss={() => setDeleteSheetOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.gapMd,
  },
  column: {
    paddingHorizontal: space.insetMd,
    paddingTop: space.insetMd,
    gap: space.gapLg,
  },
});
