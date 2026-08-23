import type { CatalogPickerItem, VisionJobResponse } from "@kit/api-contract";
import { resolveVisionSaveAction } from "@kit/api-contract";
import {
  JERSEY_CONDITION_LABELS_DA,
  JERSEY_CONDITIONS,
  JERSEY_SIZE_LABELS_DA,
  JERSEY_SIZES,
  type JerseyCondition,
  type JerseySize,
  KIT_TYPE_LABELS_DA,
  KIT_TYPES,
  type KitType,
  PHOTO_ROLES,
  type PhotoRole,
} from "@kit/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchClubSeasons, searchCatalogClubs } from "@/api/catalog";
import { saveUserJersey } from "@/api/collection";
import { fetchVisionJob, logVisionAction, startVisionSuggest } from "@/api/vision";
import { useAuth } from "@/auth/AuthProvider";
import { captureQualityForRole, readPhotoBase64 } from "@/capture/photoBytes";
import { pickGalleryPhotos } from "@/capture/pickGalleryPhotos";
import { Banner, ListRow, SearchField, Sheet } from "@/components/catalog-ui";
import { Chip } from "@/components/chip";
import { PhotoSlot } from "@/components/photo-slot";
import { PostSaveSheet } from "@/components/post-save-sheet";
import { Button, ButtonDock } from "@/components/ui";
import {
  deleteDraft,
  loadDraft,
  updateDraftFields,
  upsertDraftPhoto,
} from "@/drafts/jerseyDraftStore";
import { markJerseySaved } from "@/session/addSession";
import { color, motion, space, type } from "@/theme/tokens";

const MIN_CLUB_SEARCH_LENGTH = 2;

export default function ConfirmScreen() {
  const router = useRouter();
  const { draftId } = useLocalSearchParams<{ draftId: string }>();
  const { accessToken } = useAuth();

  const [clubSheetOpen, setClubSheetOpen] = useState(false);
  const [seasonSheetOpen, setSeasonSheetOpen] = useState(false);
  const [clubQuery, setClubQuery] = useState("");
  const [clubResults, setClubResults] = useState<CatalogPickerItem[]>([]);
  const [seasonResults, setSeasonResults] = useState<CatalogPickerItem[]>([]);
  const [selectedClub, setSelectedClub] = useState<CatalogPickerItem | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<CatalogPickerItem | null>(null);
  const [kitType, setKitType] = useState<KitType>("home");
  const [size, setSize] = useState<JerseySize>("m");
  const [condition, setCondition] = useState<JerseyCondition>("used");
  const [photoUris, setPhotoUris] = useState<Record<PhotoRole, string | undefined>>({
    front: undefined,
    back: undefined,
    label: undefined,
  });
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
  const suggestionOpacity = useRef(new Animated.Value(0)).current;
  const clubManuallySet = useRef(false);
  const seasonManuallySet = useRef(false);
  const kitTypeManuallySet = useRef(false);
  const appliedVisionJobId = useRef<string | null>(null);
  const visionStartAttempted = useRef(false);

  useEffect(() => {
    if (!draftId) {
      router.replace("/(tabs)/add/capture");
      return;
    }

    try {
      const draft = loadDraft(draftId);
      setKitType(draft.kitType);
      setSize(draft.size);
      setCondition(draft.condition);

      const uris: Record<PhotoRole, string | undefined> = {
        front: undefined,
        back: undefined,
        label: undefined,
      };
      for (const photo of draft.photos) {
        uris[photo.role] = photo.uri;
      }
      setPhotoUris(uris);

      if (draft.clubId && draft.clubLabel) {
        setSelectedClub({ id: draft.clubId, label: draft.clubLabel });
      }
    } catch {
      router.replace("/(tabs)/add/capture");
    }
  }, [draftId, router]);

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

  const refreshPhotosFromDraft = useCallback(() => {
    if (!draftId) {
      return;
    }
    const draft = loadDraft(draftId);
    const uris: Record<PhotoRole, string | undefined> = {
      front: undefined,
      back: undefined,
      label: undefined,
    };
    for (const photo of draft.photos) {
      uris[photo.role] = photo.uri;
    }
    setPhotoUris(uris);
  }, [draftId]);

  const fadeInSuggestion = useCallback(() => {
    suggestionOpacity.setValue(0);
    Animated.timing(suggestionOpacity, {
      toValue: 1,
      duration: motion.fast,
      useNativeDriver: true,
    }).start();
  }, [suggestionOpacity]);

  const applyVisionSuggestions = useCallback(
    async (job: VisionJobResponse, preselect: boolean) => {
      if (job.status !== "ready" || !job.suggestions) {
        return;
      }

      const suggestions = job.suggestions;

      if (preselect) {
        if (!clubManuallySet.current && suggestions.clubId && suggestions.clubLabel) {
          setSelectedClub({ id: suggestions.clubId, label: suggestions.clubLabel });
          setSelectedSeason(null);
          if (accessToken) {
            const seasons = await fetchClubSeasons(accessToken, suggestions.clubId);
            setSeasonResults(seasons.seasons);
          }
        }

        if (!seasonManuallySet.current && suggestions.seasonId && suggestions.seasonLabel) {
          setSelectedSeason({ id: suggestions.seasonId, label: suggestions.seasonLabel });
        }

        if (!kitTypeManuallySet.current && suggestions.type) {
          setKitType(suggestions.type);
        }

        fadeInSuggestion();
      } else {
        setVisionSuggestion(job);
        fadeInSuggestion();
      }
    },
    [accessToken, fadeInSuggestion],
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
    if (!accessToken || !draftId || visionJobId || visionStartAttempted.current) {
      return;
    }

    const draft = loadDraft(draftId);
    const firstPhoto = draft.photos[0];
    if (!firstPhoto) {
      return;
    }

    void maybeStartVision(firstPhoto.role, firstPhoto.uri);
  }, [accessToken, draftId, visionJobId, maybeStartVision]);

  useEffect(() => {
    if (!accessToken || !visionJobId || !visionPolling) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
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
    const hadPhotos = PHOTO_ROLES.some((photoRole) => photoUris[photoRole]);

    const uris = await pickGalleryPhotos({
      quality: captureQualityForRole(role),
    });

    if (!uris?.[0] || !draftId) {
      return;
    }

    upsertDraftPhoto(draftId, role, uris[0], "gallery");
    refreshPhotosFromDraft();

    if (!hadPhotos) {
      void maybeStartVision(role, uris[0]);
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
    setSelectedClub(club);
    setSelectedSeason(null);
    setClubSheetOpen(false);
    setSeasonSheetOpen(true);

    if (draftId) {
      updateDraftFields(draftId, { clubId: club.id, clubLabel: club.label, seasonId: null });
    }

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

  const photoList = PHOTO_ROLES.filter((role) => photoUris[role]);
  const [saveBlockMessage, setSaveBlockMessage] = useState<string | null>(null);

  const getSaveBlockMessage = (): string | null => {
    if (photoList.length === 0) {
      return "Mindst ét foto er påkrævet.";
    }
    if (!selectedClub) {
      return "Vælg en klub.";
    }
    if (!selectedSeason) {
      return "Vælg en sæson.";
    }
    return null;
  };

  const dockHelper = saveBlockMessage ?? getSaveBlockMessage();

  useEffect(() => {
    const blocked = photoList.length === 0 || !selectedClub || !selectedSeason;
    if (!blocked) {
      setSaveBlockMessage(null);
    }
  }, [selectedClub, selectedSeason, photoList.length]);

  const applySuggestionBanner = async () => {
    if (!visionSuggestion?.suggestions || !accessToken) {
      return;
    }

    const suggestions = visionSuggestion.suggestions;
    if (suggestions.clubId && suggestions.clubLabel) {
      clubManuallySet.current = true;
      setSelectedClub({ id: suggestions.clubId, label: suggestions.clubLabel });
      setSelectedSeason(null);
      const seasons = await fetchClubSeasons(accessToken, suggestions.clubId);
      setSeasonResults(seasons.seasons);
    }

    if (suggestions.seasonId && suggestions.seasonLabel) {
      seasonManuallySet.current = true;
      setSelectedSeason({ id: suggestions.seasonId, label: suggestions.seasonLabel });
    }

    if (suggestions.type) {
      kitTypeManuallySet.current = true;
      setKitType(suggestions.type);
    }

    setVisionSuggestion(null);
  };

  const handleSave = async () => {
    const block = getSaveBlockMessage();
    if (block) {
      setSaveBlockMessage(block);
      return;
    }

    if (!accessToken || !selectedClub || !selectedSeason || !draftId) {
      return;
    }

    setSaving(true);
    setSaveError(false);

    try {
      const draft = loadDraft(draftId);
      const photoPayload = await Promise.all(
        draft.photos.map(async (photo) => ({
          role: photo.role,
          source: photo.source,
          contentBase64: await readPhotoBase64(photo.uri),
        })),
      );

      updateDraftFields(draftId, {
        kitType,
        size,
        condition,
        clubId: selectedClub.id,
        clubLabel: selectedClub.label,
        seasonId: selectedSeason.id,
      });

      const response = await saveUserJersey(accessToken, {
        draftId,
        clubId: selectedClub.id,
        seasonId: selectedSeason.id,
        catalogKitId: null,
        type: kitType,
        size,
        condition,
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
            selectedClubId: selectedClub.id,
            selectedSeasonId: selectedSeason.id,
            selectedKitType: kitType,
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
          // Logging must not block navigation after Save — server already reconciled.
        }
      }

      markJerseySaved();
      deleteDraft(draftId);
      setSavedClub(selectedClub);
      setSavedSeasonLabel(selectedSeason.label);
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

  if (!draftId) {
    return null;
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Bekræft og gem</Text>
        <Text style={styles.body}>Vælg klub, sæson og detaljer.</Text>

        {visionPolling ? <Text style={styles.helper}>Analyserer foto…</Text> : null}

        {visionSuggestion?.suggestions ? (
          <Animated.View style={{ opacity: suggestionOpacity }}>
            <Banner
              tone="info"
              message={`Forslag: ${[
                visionSuggestion.suggestions.clubLabel,
                visionSuggestion.suggestions.seasonLabel,
              ]
                .filter(Boolean)
                .join(" · ")}`}
              action={
                <Button
                  label="Brug forslag"
                  variant="tertiary"
                  onPress={() => void applySuggestionBanner()}
                />
              }
            />
          </Animated.View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Fotos</Text>
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
            <Text style={styles.helper}>Mindst ét foto er påkrævet.</Text>
          ) : photoList.length < PHOTO_ROLES.length ? (
            <Text style={styles.helper}>3 fotos anbefales — mærkefoto gør det lettere senere.</Text>
          ) : null}
          <Button
            label="Tilføj fra galleri"
            variant="tertiary"
            onPress={() => {
              const emptyRole = PHOTO_ROLES.find((role) => !photoUris[role]);
              if (emptyRole) {
                void pickPhotoForRole(emptyRole);
              }
            }}
          />
        </View>

        {catalogMiss && !clubSheetOpen ? (
          <Banner
            tone="info"
            message="Klubben findes ikke i kataloget endnu. Dit draft bliver gemt."
            action={<Button label="Opgrader (kommer snart)" variant="tertiary" disabled />}
          />
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Klub</Text>
          <ListRow
            title={selectedClub?.label ?? "Vælg klub"}
            onPress={openClubSheet}
            selected={selectedClub !== null}
          />
        </View>

        {selectedClub ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Sæson</Text>
            <ListRow
              title={selectedSeason?.label ?? "Vælg sæson"}
              onPress={() => setSeasonSheetOpen(true)}
              selected={selectedSeason !== null}
            />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Type</Text>
          <View style={styles.chipRow}>
            {KIT_TYPES.map((value) => (
              <Chip
                key={value}
                label={KIT_TYPE_LABELS_DA[value]}
                selected={kitType === value}
                accessibilityRole="radio"
                onPress={() => {
                  kitTypeManuallySet.current = true;
                  setKitType(value);
                }}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Størrelse</Text>
          <View style={styles.chipRow}>
            {JERSEY_SIZES.map((value) => (
              <Chip
                key={value}
                label={JERSEY_SIZE_LABELS_DA[value]}
                selected={size === value}
                accessibilityRole="radio"
                onPress={() => setSize(value)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Stand</Text>
          <View style={styles.chipRow}>
            {JERSEY_CONDITIONS.map((value) => (
              <Chip
                key={value}
                label={JERSEY_CONDITION_LABELS_DA[value]}
                selected={condition === value}
                accessibilityRole="radio"
                onPress={() => setCondition(value)}
              />
            ))}
          </View>
        </View>

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
        {dockHelper ? <Text style={styles.helper}>{dockHelper}</Text> : null}
        <Button
          label="Gem"
          variant="primary"
          width="fill"
          loading={saving}
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
          <ActivityIndicator color={color.fillPrimary} style={styles.loader} />
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
          <ActivityIndicator color={color.fillPrimary} style={styles.loader} />
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled">
            {seasonResults.map((season) => (
              <ListRow
                key={season.id}
                title={season.label}
                selected={selectedSeason?.id === season.id}
                onPress={() => {
                  seasonManuallySet.current = true;
                  setSelectedSeason(season);
                  setSeasonSheetOpen(false);
                  if (draftId) {
                    updateDraftFields(draftId, { seasonId: season.id });
                  }
                }}
              />
            ))}
          </ScrollView>
        )}
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
    backgroundColor: color.canvas,
  },
  scrollContent: {
    padding: space.insetLg,
    gap: space.gapLg,
    paddingBottom: space.insetLg,
  },
  title: {
    fontFamily: type.title.fontFamily,
    fontSize: type.title.fontSize,
    lineHeight: type.title.lineHeight,
    letterSpacing: type.title.letterSpacing,
    color: color.contentPrimary,
  },
  body: {
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    color: color.contentMuted,
  },
  section: {
    gap: space.gapSm,
  },
  sectionLabel: {
    fontFamily: type.label.fontFamily,
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
    color: color.contentPrimary,
  },
  helper: {
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    color: color.contentMuted,
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
});
