import type { CatalogPickerItem, VisionJobResponse } from "@kit/api-contract";
import { resolveVisionSaveAction } from "@kit/api-contract";
import {
  JERSEY_CONDITION_LABELS_DA,
  JERSEY_CONDITIONS,
  JERSEY_SIZE_LABELS_DA,
  JERSEY_SIZES,
  KIT_TYPE_LABELS_DA,
  KIT_TYPES,
  PHOTO_ROLES,
  type PhotoRole,
} from "@kit/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { fetchClubSeasons, searchCatalogClubs } from "@/api/catalog";
import { saveUserJersey } from "@/api/collection";
import { fetchVisionJob, logVisionAction, startVisionSuggest } from "@/api/vision";
import { useAuth } from "@/auth/AuthProvider";
import { clearPersistedCaptureSession } from "@/capture/captureFlow";
import {
  canSave,
  getDraft,
  photoUriForRole,
  selectDraftCondition,
  selectDraftKitType,
  selectDraftSize,
  setDraftClub,
  setDraftNotes,
  setDraftSeason,
  upsertDraftPhoto,
} from "@/capture/captureSession";
import { expoGalleryPickerAdapter } from "@/capture/expoPickerAdapters";
import { captureQualityForRole, readPhotoBase64 } from "@/capture/photoBytes";
import { pickGalleryPhotos } from "@/capture/pickGalleryPhotos";
import { getSaveBlockMessage } from "@/capture/saveBlockMessage";
import {
  shouldConfirmRedirectAway,
  usePersistedCaptureSession,
} from "@/capture/usePersistedCaptureSession";
import { Banner, ListRow, SearchField, Sheet } from "@/components/catalog-ui";
import { Chip } from "@/components/chip";
import { PhotoSlot } from "@/components/photo-slot";
import { PostSaveSheet } from "@/components/post-save-sheet";
import { Button, ButtonDock } from "@/components/ui";
import { markJerseySaved } from "@/session/addSession";
import { useTypography } from "@/theme/brand-fonts";
import { motion, radius, space } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

const MIN_CLUB_SEARCH_LENGTH = 2;
const VISION_TIMEOUT_MS = 12_000;

export default function ConfirmScreen() {
  const router = useRouter();
  const theme = useTheme();
  const typography = useTypography();
  const reduceMotion = useReduceMotion();
  const { sessionId } = useLocalSearchParams<{
    sessionId: string;
  }>();
  const { accessToken } = useAuth();
  const { state, isSessionResolved, mutate } = usePersistedCaptureSession(sessionId);

  const [clubSheetOpen, setClubSheetOpen] = useState(false);
  const [seasonSheetOpen, setSeasonSheetOpen] = useState(false);
  const [detailsSheetOpen, setDetailsSheetOpen] = useState(false);
  const [clubQuery, setClubQuery] = useState("");
  const [clubResults, setClubResults] = useState<CatalogPickerItem[]>([]);
  const [seasonResults, setSeasonResults] = useState<CatalogPickerItem[]>([]);
  const [selectedSeasonLabel, setSelectedSeasonLabel] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catalogMiss, setCatalogMiss] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [postSaveOpen, setPostSaveOpen] = useState(false);
  const [savedClub, setSavedClub] = useState<CatalogPickerItem | null>(null);
  const [savedSeasonLabel, setSavedSeasonLabel] = useState<string | null>(null);
  const [visionJobId, setVisionJobId] = useState<string | null>(null);
  const [visionPolling, setVisionPolling] = useState(false);
  const [visionSuggestion, setVisionSuggestion] = useState<VisionJobResponse | null>(null);
  const [saveBlockMessage, setSaveBlockMessage] = useState<string | null>(null);
  const suggestionOpacity = useRef(new Animated.Value(0)).current;
  const clubManuallySet = useRef(false);
  const seasonManuallySet = useRef(false);
  const kitTypeManuallySet = useRef(false);
  const appliedVisionJobId = useRef<string | null>(null);
  const visionStartAttempted = useRef(false);

  const draft = state ? getDraft(state, state.activeDraftId) : null;

  useEffect(() => {
    if (shouldConfirmRedirectAway(sessionId, state, isSessionResolved)) {
      router.replace("/(tabs)/add");
    }
  }, [router, sessionId, state, isSessionResolved]);

  useEffect(() => {
    if (!accessToken || !draft?.clubId) {
      return;
    }

    let cancelled = false;
    void fetchClubSeasons(accessToken, draft.clubId).then((response) => {
      if (!cancelled) {
        setSeasonResults(response.seasons);
        if (draft.seasonId) {
          const match = response.seasons.find((season) => season.id === draft.seasonId);
          if (match) {
            setSelectedSeasonLabel(match.label);
          }
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, draft?.clubId, draft?.seasonId]);

  const runClubSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim();

      if (!accessToken || trimmed.length === 0) {
        setClubResults([]);
        setCatalogMiss(false);
        setSearchError(false);
        return;
      }

      setSearching(true);
      setSearchError(false);

      try {
        const response = await searchCatalogClubs(accessToken, trimmed, "da");
        setClubResults(response.clubs);
        setCatalogMiss(trimmed.length >= MIN_CLUB_SEARCH_LENGTH && response.clubs.length === 0);
      } catch {
        setClubResults([]);
        setCatalogMiss(false);
        setSearchError(true);
      } finally {
        setSearching(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    if (!clubSheetOpen) {
      return;
    }

    const handle = setTimeout(() => {
      void runClubSearch(clubQuery);
    }, 300);

    return () => clearTimeout(handle);
  }, [clubQuery, clubSheetOpen, runClubSearch]);

  const fadeInSuggestion = useCallback(() => {
    suggestionOpacity.setValue(reduceMotion ? 1 : 0);
    if (reduceMotion) {
      return;
    }
    Animated.timing(suggestionOpacity, {
      toValue: 1,
      duration: motion.fast,
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, suggestionOpacity]);

  const applyVisionSuggestions = useCallback(
    async (job: VisionJobResponse, preselect: boolean) => {
      if (job.status !== "ready" || !job.suggestions || !sessionId) {
        return;
      }

      const suggestions = job.suggestions;

      if (preselect) {
        mutate((current) => {
          let next = current;
          if (!clubManuallySet.current && suggestions.clubId && suggestions.clubLabel) {
            next = setDraftClub(
              next,
              next.activeDraftId,
              suggestions.clubId,
              suggestions.clubLabel,
            );
          }
          if (!seasonManuallySet.current && suggestions.seasonId) {
            next = setDraftSeason(next, next.activeDraftId, suggestions.seasonId);
          }
          if (!seasonManuallySet.current && suggestions.seasonLabel) {
            setSelectedSeasonLabel(suggestions.seasonLabel);
          }
          if (!kitTypeManuallySet.current && suggestions.type) {
            next = selectDraftKitType(next, next.activeDraftId, suggestions.type);
          }
          return next;
        });

        if (!seasonManuallySet.current && suggestions.clubId && accessToken) {
          const seasons = await fetchClubSeasons(accessToken, suggestions.clubId);
          setSeasonResults(seasons.seasons);
        }

        fadeInSuggestion();
      } else {
        setVisionSuggestion(job);
        fadeInSuggestion();
      }
    },
    [accessToken, fadeInSuggestion, mutate, sessionId],
  );

  const maybeStartVision = useCallback(
    async (role: PhotoRole, uri: string) => {
      if (!accessToken || visionJobId || visionStartAttempted.current) {
        return;
      }

      visionStartAttempted.current = true;

      try {
        const contentBase64 = await readPhotoBase64(uri);
        const jobId = await startVisionSuggest(accessToken, {
          photo: { role, contentBase64 },
        });
        setVisionJobId(jobId);
        setVisionPolling(true);
      } catch {
        // Vision is optional — confirm screen must not block.
      }
    },
    [accessToken, visionJobId],
  );

  useEffect(() => {
    if (!accessToken || !draft || visionJobId || visionStartAttempted.current) {
      return;
    }

    const firstPhoto = draft.photos[0];
    if (!firstPhoto) {
      return;
    }

    void maybeStartVision(firstPhoto.role ?? "front", firstPhoto.uri);
  }, [accessToken, draft, visionJobId, maybeStartVision]);

  useEffect(() => {
    if (!accessToken || !visionJobId || !visionPolling) {
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();
    const poll = async () => {
      if (Date.now() - startedAt >= VISION_TIMEOUT_MS) {
        if (!cancelled) {
          setVisionPolling(false);
        }
        return;
      }

      try {
        const job = await fetchVisionJob(accessToken, visionJobId);
        if (cancelled) {
          return;
        }

        if (job.status === "pending") {
          return;
        }

        setVisionPolling(false);

        if (job.status === "ready" && job.suggestions && appliedVisionJobId.current !== job.jobId) {
          appliedVisionJobId.current = job.jobId;
          await applyVisionSuggestions(job, job.preselect === true);
        }
      } catch {
        if (!cancelled) {
          setVisionPolling(false);
        }
      }
    };

    const interval = setInterval(() => {
      void poll();
    }, 2000);
    void poll();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [accessToken, visionJobId, visionPolling, applyVisionSuggestions]);

  const pickPhotoForRole = async (role: PhotoRole) => {
    if (!draft) {
      return;
    }

    const hadPhotos = draft.photos.length > 0;
    const uris = await pickGalleryPhotos(
      {
        quality: captureQualityForRole(role),
      },
      expoGalleryPickerAdapter,
    );

    if (!uris?.[0] || !sessionId) {
      return;
    }

    const uri = uris[0];
    mutate((current) => upsertDraftPhoto(current, current.activeDraftId, role, uri, "gallery"));

    if (!hadPhotos) {
      void maybeStartVision(role, uri);
    }
  };

  const openClubSheet = () => {
    setClubQuery("");
    setClubResults([]);
    setCatalogMiss(false);
    setSearchError(false);
    setClubSheetOpen(true);
  };

  const selectClub = async (club: CatalogPickerItem) => {
    clubManuallySet.current = true;
    seasonManuallySet.current = false;
    setSelectedSeasonLabel(null);
    mutate((current) => setDraftClub(current, current.activeDraftId, club.id, club.label));
    setClubSheetOpen(false);
    setSeasonSheetOpen(true);

    if (!accessToken) {
      return;
    }

    setLoadingSeasons(true);
    try {
      const response = await fetchClubSeasons(accessToken, club.id);
      setSeasonResults(response.seasons);
    } catch {
      setSeasonResults([]);
    } finally {
      setLoadingSeasons(false);
    }
  };

  const applySuggestionBanner = async () => {
    if (!visionSuggestion?.suggestions || !accessToken) {
      return;
    }

    const suggestions = visionSuggestion.suggestions;
    mutate((current) => {
      let next = current;
      if (suggestions.clubId && suggestions.clubLabel) {
        clubManuallySet.current = true;
        next = setDraftClub(next, next.activeDraftId, suggestions.clubId, suggestions.clubLabel);
      }
      if (suggestions.seasonId) {
        seasonManuallySet.current = true;
        next = setDraftSeason(next, next.activeDraftId, suggestions.seasonId);
      }
      if (suggestions.seasonLabel) {
        setSelectedSeasonLabel(suggestions.seasonLabel);
      }
      if (suggestions.type) {
        kitTypeManuallySet.current = true;
        next = selectDraftKitType(next, next.activeDraftId, suggestions.type);
      }
      return next;
    });

    if (suggestions.clubId) {
      const seasons = await fetchClubSeasons(accessToken, suggestions.clubId);
      setSeasonResults(seasons.seasons);
    }

    setVisionSuggestion(null);
  };

  const dismissVisionSuggestion = () => {
    setVisionSuggestion(null);
  };

  const handleSave = async () => {
    if (!draft || !sessionId) {
      return;
    }

    const block = getSaveBlockMessage(draft);
    if (block) {
      setSaveBlockMessage(block);
      return;
    }

    if (
      !accessToken ||
      !draft.clubId ||
      !draft.seasonId ||
      !draft.kitType ||
      !draft.size ||
      !draft.condition
    ) {
      return;
    }

    setSaving(true);
    setSaveError(false);

    try {
      const photoPayload = await Promise.all(
        draft.photos
          .filter((photo): photo is typeof photo & { role: PhotoRole } => photo.role !== null)
          .map(async (photo) => ({
            role: photo.role,
            source: photo.source,
            contentBase64: await readPhotoBase64(photo.uri),
          })),
      );

      const response = await saveUserJersey(accessToken, {
        draftId: draft.id,
        clubId: draft.clubId,
        seasonId: draft.seasonId,
        catalogKitId: null,
        type: draft.kitType,
        size: draft.size,
        condition: draft.condition,
        visionJobId: visionJobId ?? undefined,
        photos: photoPayload,
      });

      const jobIdForLog = response.visionJobId ?? visionJobId;
      if (jobIdForLog) {
        try {
          const job = await fetchVisionJob(accessToken, jobIdForLog);
          const resolved = resolveVisionSaveAction({
            status: job.status,
            suggestions: job.suggestions,
            selectedClubId: draft.clubId,
            selectedSeasonId: draft.seasonId,
            selectedKitType: draft.kitType,
          });

          await logVisionAction(accessToken, {
            jobId: jobIdForLog,
            action: resolved.action,
            userJerseyId: response.jersey.id,
            clubId: resolved.clubId,
            seasonId: resolved.seasonId,
            type: resolved.type,
          });
        } catch {
          // Logging must not block navigation after Save.
        }
      }

      markJerseySaved();
      clearPersistedCaptureSession(sessionId);
      setSavedClub(draft.clubLabel ? { id: draft.clubId, label: draft.clubLabel } : null);
      setSavedSeasonLabel(selectedSeasonLabel);
      setPostSaveOpen(true);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const handlePostSaveDismiss = () => {
    setPostSaveOpen(false);
    router.replace("/(tabs)/collection");
  };

  if (!sessionId || !draft) {
    return null;
  }

  const photoUris: Record<PhotoRole, string | undefined> = {
    front: photoUriForRole(draft, "front") ?? undefined,
    back: photoUriForRole(draft, "back") ?? undefined,
    label: photoUriForRole(draft, "label") ?? undefined,
  };
  const photoList = PHOTO_ROLES.filter((role) => photoUris[role]);
  const selectedClub =
    draft.clubId && draft.clubLabel ? { id: draft.clubId, label: draft.clubLabel } : null;
  const selectedSeason =
    draft.seasonId && selectedSeasonLabel
      ? { id: draft.seasonId, label: selectedSeasonLabel }
      : null;
  const dockHelper = saveBlockMessage ?? getSaveBlockMessage(draft);
  const saveEnabled = canSave(draft);

  return (
    <View style={[styles.container, { backgroundColor: theme.canvas }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={[typography.title, { color: theme.contentPrimary }]}>Bekræft og gem</Text>
        <Text style={[typography.body, { color: theme.contentMuted }]}>
          Vælg klub, sæson og detaljer.
        </Text>

        <View style={styles.section}>
          <Text style={[typography.label, { color: theme.contentPrimary }]}>Fotos</Text>
          <View style={styles.photoRow}>
            {PHOTO_ROLES.map((role) => (
              <PhotoSlot
                key={role}
                role={role}
                uri={photoUris[role]}
                onPress={() => void pickPhotoForRole(role)}
              />
            ))}
          </View>
          {photoList.length === 0 ? (
            <Text style={[typography.caption, { color: theme.contentMuted }]}>
              Mindst ét foto er påkrævet.
            </Text>
          ) : photoList.length < PHOTO_ROLES.length ? (
            <Text style={[typography.caption, { color: theme.contentMuted }]}>
              3 fotos anbefales — mærkefoto gør det lettere senere.
            </Text>
          ) : null}
        </View>

        {visionPolling ? (
          <Text style={[typography.caption, { color: theme.contentMuted }]}>Analyserer foto…</Text>
        ) : null}

        {visionSuggestion?.suggestions ? (
          <Animated.View style={{ opacity: suggestionOpacity }}>
            <Banner
              tone="info"
              message={`Forslag: ${[
                visionSuggestion.suggestions.clubLabel,
                visionSuggestion.suggestions.seasonLabel,
                visionSuggestion.suggestions.type
                  ? KIT_TYPE_LABELS_DA[visionSuggestion.suggestions.type]
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}`}
              action={
                <View style={styles.visionActions}>
                  <Button
                    label="Brug"
                    variant="tertiary"
                    onPress={() => void applySuggestionBanner()}
                  />
                  <Button label="Luk" variant="tertiary" onPress={dismissVisionSuggestion} />
                </View>
              }
            />
          </Animated.View>
        ) : null}

        {catalogMiss && !clubSheetOpen ? (
          <Banner
            tone="info"
            message="Klubben findes ikke i kataloget endnu. Dit draft bliver gemt."
            action={<Button label="Opgrader (kommer snart)" variant="tertiary" disabled />}
          />
        ) : null}

        <View style={styles.section}>
          <Text style={[typography.label, { color: theme.contentPrimary }]}>Klub</Text>
          <ListRow
            title={selectedClub?.label ?? "Vælg klub"}
            onPress={openClubSheet}
            selected={selectedClub !== null}
          />
        </View>

        {selectedClub ? (
          <View style={styles.section}>
            <Text style={[typography.label, { color: theme.contentPrimary }]}>Sæson</Text>
            <ListRow
              title={selectedSeason?.label ?? "Vælg sæson"}
              onPress={() => setSeasonSheetOpen(true)}
              selected={selectedSeason !== null}
            />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={[typography.label, { color: theme.contentPrimary }]}>Type</Text>
          <View style={styles.chipRow}>
            {KIT_TYPES.map((value) => (
              <Chip
                key={value}
                label={KIT_TYPE_LABELS_DA[value]}
                selected={draft.kitTypeSelected && draft.kitType === value}
                accessibilityRole="radio"
                onPress={() => {
                  kitTypeManuallySet.current = true;
                  mutate((current) => selectDraftKitType(current, current.activeDraftId, value));
                }}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[typography.label, { color: theme.contentPrimary }]}>Størrelse</Text>
          <View style={styles.chipRow}>
            {JERSEY_SIZES.map((value) => (
              <Chip
                key={value}
                label={JERSEY_SIZE_LABELS_DA[value]}
                selected={draft.sizeSelected && draft.size === value}
                accessibilityRole="radio"
                onPress={() => {
                  mutate((current) => selectDraftSize(current, current.activeDraftId, value));
                }}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[typography.label, { color: theme.contentPrimary }]}>Stand</Text>
          <View style={styles.chipRow}>
            {JERSEY_CONDITIONS.map((value) => (
              <Chip
                key={value}
                label={JERSEY_CONDITION_LABELS_DA[value]}
                selected={draft.conditionSelected && draft.condition === value}
                accessibilityRole="radio"
                onPress={() => {
                  mutate((current) => selectDraftCondition(current, current.activeDraftId, value));
                }}
              />
            ))}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => setDetailsSheetOpen(true)}
          style={styles.detailsLink}
        >
          <Text style={[typography.label, { color: theme.contentSecondary }]}>Flere detaljer</Text>
        </Pressable>

        {saveError ? (
          <Banner
            tone="danger"
            message="Kunne ikke gemme trøjen. Prøv igen."
            action={
              <Button label="Prøv igen" variant="tertiary" onPress={() => void handleSave()} />
            }
          />
        ) : null}
      </ScrollView>

      <ButtonDock>
        {dockHelper ? (
          <Text style={[typography.caption, { color: theme.contentMuted }]}>{dockHelper}</Text>
        ) : null}
        <Button
          label="Gem"
          variant="primary"
          width="fill"
          loading={saving}
          disabled={!saveEnabled}
          onPress={() => void handleSave()}
        />
      </ButtonDock>

      <Sheet visible={clubSheetOpen} title="Vælg klub" onDismiss={() => setClubSheetOpen(false)}>
        <SearchField
          variant="catalog"
          accessibilityLabel="Søg klub"
          placeholder="Søg klub"
          value={clubQuery}
          onChangeText={setClubQuery}
          onClear={() => setClubQuery("")}
        />

        {catalogMiss ? (
          <Banner
            tone="info"
            message="Klubben findes ikke i kataloget endnu."
            action={<Button label="Opgrader (kommer snart)" variant="tertiary" disabled />}
          />
        ) : null}

        {searchError ? (
          <Banner
            tone="warning"
            message="Kunne ikke søge i kataloget. Prøv igen."
            action={
              <Button
                label="Prøv igen"
                variant="tertiary"
                onPress={() => void runClubSearch(clubQuery)}
              />
            }
          />
        ) : null}

        {searching ? (
          <ActivityIndicator color={theme.fillPrimary} style={styles.loader} />
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled">
            {clubResults.map((club) => (
              <ListRow
                key={club.id}
                title={club.label}
                selected={selectedClub?.id === club.id}
                onPress={() => void selectClub(club)}
              />
            ))}
          </ScrollView>
        )}
      </Sheet>

      <Sheet
        visible={seasonSheetOpen}
        title="Vælg sæson"
        onDismiss={() => setSeasonSheetOpen(false)}
      >
        {loadingSeasons ? (
          <ActivityIndicator color={theme.fillPrimary} style={styles.loader} />
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled">
            {seasonResults.map((season) => (
              <ListRow
                key={season.id}
                title={season.label}
                selected={selectedSeason?.id === season.id}
                onPress={() => {
                  seasonManuallySet.current = true;
                  setSelectedSeasonLabel(season.label);
                  mutate((current) => setDraftSeason(current, current.activeDraftId, season.id));
                  setSeasonSheetOpen(false);
                }}
              />
            ))}
          </ScrollView>
        )}
      </Sheet>

      <Sheet
        visible={detailsSheetOpen}
        title="Flere detaljer"
        onDismiss={() => setDetailsSheetOpen(false)}
      >
        <Text style={[typography.label, { color: theme.contentPrimary }]}>Noter</Text>
        <Text style={[typography.caption, { color: theme.contentMuted }]}>
          Noter gemmes i denne session. De sendes ikke med ved Gem endnu.
        </Text>
        <TextInput
          accessibilityLabel="Noter"
          multiline
          placeholder="Noter om trøjen"
          placeholderTextColor={theme.contentMuted}
          value={draft.notes}
          onChangeText={(text) => {
            mutate((current) => setDraftNotes(current, current.activeDraftId, text));
          }}
          style={[
            styles.notesInput,
            typography.body,
            {
              color: theme.contentPrimary,
              borderColor: theme.borderSubtle,
              backgroundColor: theme.surface,
              borderRadius: radius.sm,
            },
          ]}
        />
      </Sheet>

      <PostSaveSheet
        visible={postSaveOpen}
        savedClub={savedClub}
        savedSeasonLabel={savedSeasonLabel}
        onDismiss={handlePostSaveDismiss}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: space.insetLg,
    gap: space.gapLg,
    paddingBottom: space.insetLg,
  },
  section: {
    gap: space.gapSm,
  },
  photoRow: {
    flexDirection: "row",
    gap: space.gapSm,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.gapSm,
  },
  loader: {
    paddingVertical: space.insetLg,
  },
  visionActions: {
    flexDirection: "row",
    gap: space.gapSm,
  },
  detailsLink: {
    minHeight: 44,
    justifyContent: "center",
  },
  notesInput: {
    minHeight: 120,
    borderWidth: 1,
    padding: space.insetMd,
    textAlignVertical: "top",
  },
});
