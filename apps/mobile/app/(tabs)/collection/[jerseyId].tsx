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
import Toast from "react-native-toast-message";
import { patchJerseyBidding, patchJerseyPrivate } from "@/api/bidding";
import { fetchClubSeasons, fetchSeasonPatches, searchCatalogPlayers } from "@/api/catalog";
import {
  addUserJerseyPhoto,
  deleteUserJersey,
  fetchCollectionJerseys,
  resolvePhotoUrl,
  updateUserJersey,
} from "@/api/collection";
import { useAuth } from "@/auth/AuthProvider";
import { expoGalleryPickerAdapter } from "@/capture/expoPickerAdapters";
import { captureQualityForRole, readPreparedPhotoBase64 } from "@/capture/photoBytes";
import { pickGalleryPhotos } from "@/capture/pickGalleryPhotos";
import { Banner } from "@/components/catalog-ui";
import { ClubPickerOverlay } from "@/components/club-picker-overlay";
import { formatThreadTime } from "@/components/thread-row";
import { Button, IconButton } from "@/components/ui";
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
import {
  applyJerseyEdit,
  type ClubChangeCopy,
  clubChangeCopy,
  JERSEY_EDIT_FAILURE_MESSAGE,
  type JerseyEdit,
  type JerseyEditOutcome,
  type JerseyFactKey,
} from "@/jersey-detail/jersey-edit";
import {
  JerseyClubChangeSheet,
  JerseyFactSheet,
  JerseySeasonSheet,
} from "@/jersey-detail/jersey-edit-sheets";
import { JerseyPhotoPager, JerseyThumbStrip } from "@/jersey-detail/jersey-photos";
import { JerseyPlayerPicker } from "@/jersey-detail/jersey-player-picker";
import { loadOwnJersey } from "@/jersey-detail/own-jersey-load";
import { readPlaceOverview, writePlaceOverview } from "@/navigation/place-overview-cache";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type PendingMoreAction = "delete";

type Named = { id: string; label: string };
type Side = Named & { kind?: "club" | "national_team" };

/** The one edit surface that is open: a fact sheet, a picker, or a step of the club change. */
type EditSurface =
  | { kind: "fact"; key: JerseyFactKey }
  | { kind: "season" }
  | { kind: "player" }
  | { kind: "club" }
  | {
      kind: "club-confirm";
      club: Side;
      seasons: Named[];
      copy: ClubChangeCopy;
      needsSeason: boolean;
    }
  | { kind: "club-season"; club: Side; seasons: Named[] };

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
  // One edit at a time: two PATCHes of a whole-row update must never race.
  const busy = useRef(false);
  // iOS cannot present a Modal over one that is still leaving: the next surface waits for the
  // one that closed to report onModalHide.
  const surfaceRef = useRef<EditSurface | null>(null);
  const surfaceHiding = useRef(false);
  const nextSurface = useRef<EditSurface | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
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
  const [surface, setSurface] = useState<EditSurface | null>(null);
  const [saving, setSaving] = useState(false);
  const [addingPhoto, setAddingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // Set when a photo was just added: the pager jumps to the new (last) photo once it is rendered.
  const jumpToNewPhoto = useRef(false);

  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    if (accessToken && jerseyId) {
      let fetched: CollectionJersey[] = [];
      const outcome = await loadOwnJersey(async () => {
        const response = await fetchCollectionJerseys(accessToken);
        fetched = response.jerseys;
        return response;
      }, jerseyId);
      if (seq !== loadSeq.current) {
        return;
      }
      const found = outcome.kind === "found" ? outcome.jersey : null;
      setLoadFailed(outcome.kind === "error");
      setList(fetched);
      setJersey(found);
      setBiddingEnabled(found?.biddingEnabled ?? false);
      setIsPrivate(found?.private ?? false);
      setPhotoIndex(0);
    }
    setLoading(false);
  }, [accessToken, jerseyId]);

  useEffect(() => {
    void load();

    return () => {
      loadSeq.current += 1;
    };
  }, [load]);

  const retryLoad = () => {
    setLoading(true);
    void load();
  };

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

  // The More sheet closes first; on iOS the confirm Sheet waits for Modal.onDismiss so it does
  // not layer over a closing Modal.
  const runPendingMoreAction = () => {
    const next = pendingMoreAction.current;
    pendingMoreAction.current = null;
    if (next === "delete") {
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

  const closeSurface = () => {
    if (surfaceRef.current) {
      surfaceHiding.current = Platform.OS === "ios";
    }
    surfaceRef.current = null;
    setSurface(null);
  };

  const presentSurface = (next: EditSurface) => {
    if (surfaceHiding.current) {
      nextSurface.current = next;
      return;
    }
    surfaceRef.current = next;
    setSurface(next);
  };

  const openSurface = (next: EditSurface) => {
    if (busy.current) {
      return;
    }
    presentSurface(next);
  };

  const onSurfaceHidden = () => {
    surfaceHiding.current = false;
    const next = nextSurface.current;
    nextSurface.current = null;
    if (next) {
      presentSurface(next);
    }
  };

  const showEditFailed = () => {
    Toast.show({ type: "error", position: "bottom", text1: JERSEY_EDIT_FAILURE_MESSAGE });
  };

  /** Runs one edit start to finish; a second edit while it runs is ignored. */
  const exclusively = async (work: () => Promise<void>) => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setSaving(true);
    try {
      await work();
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  // The edit shows on screen at once; the server answer replaces it (a club change changes the
  // labels and the squad), and a failed save puts the old jersey back.
  const saveOutcome = async (outcome: Extract<JerseyEditOutcome, { status: "ok" }>) => {
    if (!accessToken || !jersey) {
      return;
    }
    const previous = jersey;
    setJersey(outcome.optimistic);
    try {
      const updated = await updateUserJersey(accessToken, previous.id, outcome.body);
      setJersey(updated);
      setList((current) => replaceJerseyInList(current, updated));
      syncCollectionCache(updated);
    } catch {
      setJersey(previous);
      showEditFailed();
    }
  };

  const submitEdit = (edit: JerseyEdit) =>
    exclusively(async () => {
      if (!jersey) {
        return;
      }
      const outcome = applyJerseyEdit(jersey, edit);
      if (outcome.status === "ok") {
        await saveOutcome(outcome);
      }
    });

  const sideId = jersey?.clubId ?? jersey?.nationalTeamId ?? null;

  const chooseSeason = (season: Named) => {
    if (!accessToken || !jersey || !sideId || season.id === jersey.seasonId) {
      return;
    }
    const current = jersey;
    void exclusively(async () => {
      try {
        // The squad and the patches are only needed to check what the jersey already carries.
        const [squad, patches] = await Promise.all([
          current.playerId
            ? searchCatalogPlayers(accessToken, "", "da", {
                clubId: sideId,
                seasonId: season.id,
              }).then((response) => response.items)
            : Promise.resolve([]),
          (current.patches ?? []).length > 0
            ? fetchSeasonPatches(accessToken, season.id).then((response) => response.items)
            : Promise.resolve([]),
        ]);
        const outcome = applyJerseyEdit(current, { kind: "season", season, squad, patches });
        if (outcome.status === "ok") {
          await saveOutcome(outcome);
        }
      } catch {
        showEditFailed();
      }
    });
  };

  // Club picked: nothing is saved. The confirm sheet says what is kept and what is reset.
  const chooseClub = (club: Side, seasons: Named[]) => {
    if (!jersey) {
      return;
    }
    const outcome = applyJerseyEdit(jersey, {
      kind: "club",
      club,
      seasons,
      patches: jersey.patches ?? [],
    });
    presentSurface({
      kind: "club-confirm",
      club,
      seasons,
      copy: clubChangeCopy(jersey, club.label, outcome.reset),
      needsSeason: outcome.status === "choose-season",
    });
  };

  const pickClub = (row: Side) => {
    if (!accessToken || !jersey || row.id === (jersey.clubId ?? jersey.nationalTeamId)) {
      return;
    }
    const club: Side = { id: row.id, label: row.label, kind: row.kind };
    void exclusively(async () => {
      try {
        const { seasons } = await fetchClubSeasons(accessToken, club.id);
        chooseClub(club, seasons);
      } catch {
        showEditFailed();
      }
    });
  };

  const confirmClubChange = (open: Extract<EditSurface, { kind: "club-confirm" }>) => {
    closeSurface();
    if (open.needsSeason) {
      presentSurface({ kind: "club-season", club: open.club, seasons: open.seasons });
      return;
    }
    if (!jersey) {
      return;
    }
    void submitEdit({
      kind: "club",
      club: open.club,
      seasons: open.seasons,
      patches: jersey.patches ?? [],
    });
  };

  // The new club lacks the jersey's season: the collector picks one, then the club and the
  // season are saved together.
  const chooseSeasonForNewClub = (
    open: Extract<EditSurface, { kind: "club-season" }>,
    season: Named,
  ) => {
    if (!accessToken || !jersey) {
      return;
    }
    const current = jersey;
    void exclusively(async () => {
      try {
        const patches =
          (current.patches ?? []).length > 0
            ? (await fetchSeasonPatches(accessToken, season.id)).items
            : [];
        const outcome = applyJerseyEdit(current, {
          kind: "club",
          club: open.club,
          seasons: open.seasons,
          chosenSeason: season,
          patches,
        });
        if (outcome.status === "ok") {
          await saveOutcome(outcome);
        }
      } catch {
        showEditFailed();
      }
    });
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

  if (loadFailed) {
    return (
      <View
        testID="jersey-detail-load-error"
        style={[
          styles.errorScreen,
          { backgroundColor: theme.canvas, paddingTop: insets.top + space.insetSm },
        ]}
      >
        <IconButton
          testID="jersey-detail-back"
          name="Tilbage"
          icon="arrow-back"
          onPress={() => router.back()}
        />
        <View style={styles.loadError}>
          <Banner
            tone="danger"
            message="Kunne ikke hente trøjen. Prøv igen."
            action={
              <Button
                testID="jersey-detail-load-retry"
                label="Prøv igen"
                variant="tertiary"
                onPress={retryLoad}
              />
            }
          />
        </View>
      </View>
    );
  }

  if (!jersey || !view) {
    return (
      <View
        testID="jersey-detail-not-found"
        style={[styles.centered, { backgroundColor: theme.canvas }]}
      >
        <Text style={[typography.body, { color: theme.contentSecondary }]}>Trøjen findes ikke</Text>
        <IconButton
          testID="jersey-detail-back"
          name="Tilbage"
          icon="arrow-back"
          onPress={() => router.back()}
        />
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
          <JerseyTitleBlock
            caption={view.caption}
            title={view.title}
            season={view.season}
            targets={view.titleTargets}
            disabled={saving}
            onClubPress={() => openSurface({ kind: "club" })}
            onSeasonPress={() => openSurface({ kind: "season" })}
          />

          {bidRow ? (
            <JerseyBidRow row={bidRow} onPress={() => openBidTarget(bidRow.target)} />
          ) : null}

          <JerseyPlayerRow
            row={view.playerRow}
            disabled={saving}
            onPress={() => openSurface({ kind: "player" })}
          />

          <View>
            {view.factRows.map((row, index) => (
              <JerseyFactRow
                key={row.key}
                row={row}
                hairline={index < view.factRows.length - 1}
                disabled={saving}
                onPress={() => openSurface({ kind: "fact", key: row.key })}
              />
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

      <JerseyFactSheet
        visible={surface?.kind === "fact"}
        factKey={surface?.kind === "fact" ? surface.key : null}
        jersey={jersey}
        accessToken={accessToken}
        onSelect={(edit) => void submitEdit(edit)}
        onDismiss={closeSurface}
        onModalHide={onSurfaceHidden}
      />

      <JerseySeasonSheet
        visible={surface?.kind === "season"}
        title="Sæson"
        sideId={sideId}
        currentSeasonId={jersey.seasonId}
        accessToken={accessToken}
        onSelect={chooseSeason}
        onDismiss={closeSurface}
        onModalHide={onSurfaceHidden}
      />

      <JerseyPlayerPicker
        visible={surface?.kind === "player"}
        jersey={jersey}
        accessToken={accessToken}
        onSelect={(player) => void submitEdit({ kind: "player", player })}
        onRemove={() => void submitEdit({ kind: "player", player: null })}
        onDismiss={closeSurface}
        onModalHide={onSurfaceHidden}
      />

      <ClubPickerOverlay
        visible={surface?.kind === "club"}
        accessToken={accessToken}
        selectedClubId={jersey.clubId ?? jersey.nationalTeamId}
        onSelect={pickClub}
        onDismiss={closeSurface}
        onModalHide={onSurfaceHidden}
      />

      <JerseyClubChangeSheet
        visible={surface?.kind === "club-confirm"}
        copy={surface?.kind === "club-confirm" ? surface.copy : null}
        onConfirm={() => surface?.kind === "club-confirm" && confirmClubChange(surface)}
        onKeep={closeSurface}
        onModalHide={onSurfaceHidden}
      />

      <JerseySeasonSheet
        visible={surface?.kind === "club-season"}
        title={surface?.kind === "club-season" ? `Sæson hos ${surface.club.label}` : "Sæson"}
        sideId={surface?.kind === "club-season" ? surface.club.id : null}
        currentSeasonId={null}
        accessToken={accessToken}
        onSelect={(season) =>
          surface?.kind === "club-season" && chooseSeasonForNewClub(surface, season)
        }
        onDismiss={closeSurface}
        onModalHide={onSurfaceHidden}
      />

      <JerseyMoreSheet
        visible={moreOpen}
        onDismiss={() => {
          pendingMoreAction.current = null;
          setMoreOpen(false);
        }}
        onModalHide={runPendingMoreAction}
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
  errorScreen: {
    flex: 1,
    alignItems: "flex-start",
    gap: space.gapMd,
    paddingHorizontal: space.insetMd,
  },
  loadError: {
    alignSelf: "stretch",
  },
  column: {
    paddingHorizontal: space.insetMd,
    paddingTop: space.insetMd,
    gap: space.gapLg,
  },
});
