import type { CatalogPickerItem, VisionJobResponse } from "@kit/api-contract";
import { resolveVisionSaveAction } from "@kit/api-contract";
import {
  JERSEY_CONDITION_LABELS_DA,
  JERSEY_CONDITIONS,
  JERSEY_SIZE_LABELS_DA,
  JERSEY_SIZES,
  KIT_TYPE_LABELS_DA,
  KIT_TYPES,
  type PhotoRole,
  UNIVERSAL_PHOTO_ROLES,
  type UniversalPhotoRole,
} from "@kit/domain";
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
  addJerseyDraft,
  appendUnboundPhotos,
  bindUnboundPhotoToDraft,
  canAddPhotoToDraft,
  canSave,
  changeDraftPhotoRole,
  discardUnboundPhoto,
  getDraft,
  JERSEY_PHOTO_CAP_HELPER_DA,
  photoUriForRole,
  removeDraft,
  removeDraftPhoto,
  selectDraftCondition,
  selectDraftKitType,
  selectDraftSize,
  setActiveDraft,
  setDraftClub,
  setDraftNotes,
  setDraftPhotoLabel,
  setDraftSeason,
  switchSingleToBulkBind,
  upsertDraftPhoto,
} from "@/capture/captureSession";
import { resolveConfirmBanner } from "@/capture/confirmBanner";
import { expoGalleryPickerAdapter, expoUploadFilesAdapter } from "@/capture/expoPickerAdapters";
import { captureQualityForRole, readPreparedPhotoBase64 } from "@/capture/photoBytes";
import { pickGalleryPhotos } from "@/capture/pickGalleryPhotos";
import { pickUploadFiles } from "@/capture/pickUploadFiles";
import { getSaveBlockMessage } from "@/capture/saveBlockMessage";
import { showSaveFailureToast } from "@/capture/saveFailureToast";
import { usePersistedCaptureSession } from "@/capture/usePersistedCaptureSession";
import { BulkChrome } from "@/components/bulk/BulkChrome";
import { UnboundPhotosRow } from "@/components/bulk/UnboundPhotosRow";
import { Banner, ListRow, SearchField, Sheet } from "@/components/catalog-ui";
import { Chip } from "@/components/chip";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { PhotoSlot } from "@/components/photo-slot";
import { Button, ButtonDock } from "@/components/ui";
import { shouldGateFirstSessionSave } from "@/first-session/first-session-entitlement";
import {
  JERSEY_DETAILS_PRIMARY_SAVE,
  JERSEY_DETAILS_SAVE_AND_NEXT,
  JERSEY_DETAILS_TITLE,
} from "@/first-session/jersey-details-copy";
import { markJerseySaved } from "@/session/addSession";
import { useTypography } from "@/theme/brand-fonts";
import { motion, radius, space } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

const MIN_CLUB_SEARCH_LENGTH = 2;
const VISION_TIMEOUT_MS = 12_000;
const ADD_PHOTO_ROLE: PhotoRole = "other";

type JerseyDetailsScreenProps = {
  captureSessionId: string;
  jerseysSavedInSession: number;
  /** Called when the last/only jersey is saved and host should enter result Collection. */
  onSaved: () => void;
  /** Mid-bulk: a jersey was saved; stay on details and bump session save count. */
  onJerseySavedInDump?: () => void;
};

export function JerseyDetailsScreen({
  captureSessionId,
  jerseysSavedInSession,
  onSaved,
  onJerseySavedInDump,
}: JerseyDetailsScreenProps) {
  const theme = useTheme();
  const typography = useTypography();
  const reduceMotion = useReduceMotion();
  const sessionId = captureSessionId;
  const { accessToken, requestPremiumAccess } = useAuth();
  const { state, mutate } = usePersistedCaptureSession(sessionId);

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
  const [visionJobId, setVisionJobId] = useState<string | null>(null);
  const [visionPolling, setVisionPolling] = useState(false);
  const [visionSuggestion, setVisionSuggestion] = useState<VisionJobResponse | null>(null);
  const [saveBlockMessage, setSaveBlockMessage] = useState<string | null>(null);
  const [photoCapMessage, setPhotoCapMessage] = useState<string | null>(null);
  const [lightboxRole, setLightboxRole] = useState<PhotoRole | null>(null);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const suggestionOpacity = useRef(new Animated.Value(0)).current;
  const clubManuallySet = useRef(false);
  const seasonManuallySet = useRef(false);
  const kitTypeManuallySet = useRef(false);
  const appliedVisionJobId = useRef<string | null>(null);
  const visionStartAttempted = useRef(false);

  const draft = state ? getDraft(state, state.activeDraftId) : null;
  const isBulk = state?.branch === "bulk";
  const visionDraftId = draft?.id ?? null;
  const visionFirstPhotoUri = draft?.photos[0]?.uri ?? null;
  const visionFirstPhotoRole = draft?.photos[0]?.role ?? "front";

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
      if (job.status !== "ready" || !job.suggestions) {
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
    [accessToken, fadeInSuggestion, mutate],
  );

  const maybeStartVision = useCallback(
    async (role: PhotoRole, uri: string) => {
      if (!accessToken || visionJobId || visionStartAttempted.current) {
        return;
      }

      visionStartAttempted.current = true;

      try {
        const contentBase64 = await readPreparedPhotoBase64(uri, role, "visionIdentity");
        const jobId = await startVisionSuggest(accessToken, {
          photo: { role, contentBase64 },
        });
        setVisionJobId(jobId);
        setVisionPolling(true);
      } catch {
        // Vision is optional — Save must not wait.
      }
    },
    [accessToken, visionJobId],
  );

  useEffect(() => {
    setVisionJobId(null);
    setVisionPolling(false);
    setVisionSuggestion(null);
    visionStartAttempted.current = false;
    appliedVisionJobId.current = null;
    clubManuallySet.current = false;
    seasonManuallySet.current = false;
    kitTypeManuallySet.current = false;
    setSelectedSeasonLabel(null);

    if (!accessToken || !visionDraftId || !visionFirstPhotoUri) {
      return;
    }

    let cancelled = false;
    void (async () => {
      visionStartAttempted.current = true;
      try {
        const contentBase64 = await readPreparedPhotoBase64(
          visionFirstPhotoUri,
          visionFirstPhotoRole,
          "visionIdentity",
        );
        const jobId = await startVisionSuggest(accessToken, {
          photo: { role: visionFirstPhotoRole, contentBase64 },
        });
        if (!cancelled) {
          setVisionJobId(jobId);
          setVisionPolling(true);
        }
      } catch {
        // Vision is optional — Save must not wait.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, visionDraftId, visionFirstPhotoUri, visionFirstPhotoRole]);

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

  const pickPhotoForRole = async (role: PhotoRole, replaceUri?: string) => {
    if (!draft) {
      return;
    }

    if (isBulk && role !== "other") {
      return;
    }

    if (!replaceUri && !canAddPhotoToDraft(draft)) {
      setPhotoCapMessage(JERSEY_PHOTO_CAP_HELPER_DA);
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

    setPhotoCapMessage(null);
    const uri = uris[0];
    const existingLabel =
      replaceUri && role === "other"
        ? draft.photos.find((photo) => photo.uri === replaceUri)?.label
        : undefined;
    mutate((current) => {
      const draftId = current.activeDraftId;
      const base =
        replaceUri && role === "other"
          ? removeDraftPhoto(current, draftId, "other", replaceUri)
          : current;
      const next = upsertDraftPhoto(base, draftId, role, uri, "gallery");
      if (existingLabel) {
        return setDraftPhotoLabel(next, draftId, uri, existingLabel);
      }
      return next;
    });

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

  const handleAddPhotoPress = () => {
    if (!draft) {
      return;
    }

    if (!canAddPhotoToDraft(draft)) {
      setPhotoCapMessage(JERSEY_PHOTO_CAP_HELPER_DA);
      return;
    }

    void pickPhotoForRole("other");
  };

  const handlePhotoSlotPress = (role: PhotoRole) => {
    if (!state || !draft) {
      return;
    }

    const uri = photoUriForRole(draft, role);
    if (uri) {
      setLightboxRole(role);
      setLightboxUri(uri);
      return;
    }

    if (isBulk) {
      const firstUnbound = state.unboundUris[0];
      if (firstUnbound) {
        mutate((current) =>
          bindUnboundPhotoToDraft(current, firstUnbound, current.activeDraftId, role),
        );
      }
      return;
    }

    void pickPhotoForRole(role);
  };

  const handleLightboxReplace = () => {
    if (!lightboxRole) {
      return;
    }
    const role = lightboxRole;
    const replaceUri = lightboxUri ?? undefined;
    setLightboxRole(null);
    setLightboxUri(null);
    void pickPhotoForRole(role, replaceUri);
  };

  const handleLightboxDelete = () => {
    if (!lightboxRole || !lightboxUri) {
      return;
    }
    const role = lightboxRole;
    const uri = lightboxUri;
    mutate((current) => removeDraftPhoto(current, current.activeDraftId, role, uri));
    setLightboxRole(null);
    setLightboxUri(null);
  };

  const handleLightboxChangeRole = (toRole: PhotoRole) => {
    if (!lightboxRole) {
      return;
    }
    const fromRole = lightboxRole;
    mutate((current) =>
      changeDraftPhotoRole(
        current,
        current.activeDraftId,
        fromRole,
        toRole,
        lightboxUri ?? undefined,
      ),
    );
    setLightboxRole(toRole);
  };

  const handleLightboxChangeLabel = (label: string) => {
    if (!lightboxUri) {
      return;
    }
    mutate((current) => setDraftPhotoLabel(current, current.activeDraftId, lightboxUri, label));
  };

  const handleBindUnboundPhoto = (uri: string) => {
    if (draft && !canAddPhotoToDraft(draft)) {
      setPhotoCapMessage(JERSEY_PHOTO_CAP_HELPER_DA);
      return;
    }

    setPhotoCapMessage(null);
    mutate((current) => bindUnboundPhotoToDraft(current, uri, current.activeDraftId));
  };

  const handleDiscardUnboundPhoto = (uri: string) => {
    mutate((current) => discardUnboundPhoto(current, uri));
  };

  const handleUploadToSandbox = async () => {
    const uris = await pickUploadFiles({ allowsMultipleSelection: true }, expoUploadFilesAdapter);
    if (!uris?.length) {
      return;
    }
    mutate((current) => appendUnboundPhotos(current, uris));
  };

  const handleSelectDraft = (draftId: string) => {
    mutate((current) => setActiveDraft(current, draftId));
  };

  const handleAddJersey = () => {
    mutate((current) =>
      addJerseyDraft(current.branch === "single" ? switchSingleToBulkBind(current) : current),
    );
  };

  const handleMoreJerseysInUpload = () => {
    mutate(switchSingleToBulkBind);
  };

  const activeBanner = resolveConfirmBanner({
    // Save failure is an animated bottom toast now, not an inline banner.
    saveError: false,
    visionSuggestionVisible: Boolean(visionSuggestion?.suggestions),
    catalogMiss,
    clubSheetOpen,
  });

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

    if (shouldGateFirstSessionSave({ jerseysSavedInSession })) {
      const granted = await requestPremiumAccess();
      if (!granted) {
        return;
      }
    }

    setSaving(true);

    try {
      const photoPayload = await Promise.all(
        draft.photos
          .filter((photo): photo is typeof photo & { role: PhotoRole } => photo.role !== null)
          .map(async (photo) => ({
            role: photo.role,
            source: photo.source,
            contentBase64: await readPreparedPhotoBase64(photo.uri, photo.role, "display"),
            ...(photo.role === "other" && photo.label?.trim() ? { label: photo.label.trim() } : {}),
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

      if (state?.branch === "bulk") {
        const nextState = mutate((current) => {
          let next = removeDraft(current, draft.id);
          if (next.drafts.length === 0 && next.unboundUris.length > 0) {
            next = addJerseyDraft(next);
          }
          return next;
        });

        if (nextState && nextState.drafts.length > 0) {
          onJerseySavedInDump?.();
          return;
        }

        clearPersistedCaptureSession(sessionId);
        onSaved();
        return;
      }

      clearPersistedCaptureSession(sessionId);
      onSaved();
    } catch {
      // Fire-and-forget danger toast with a Prøv igen retry — Save never waits on it.
      showSaveFailureToast(() => void handleSave());
    } finally {
      setSaving(false);
    }
  };

  if (!sessionId || !draft) {
    return null;
  }

  const universalPhotoUris: Record<UniversalPhotoRole, string | undefined> = {
    front: photoUriForRole(draft, "front") ?? undefined,
    back: photoUriForRole(draft, "back") ?? undefined,
    left: photoUriForRole(draft, "left") ?? undefined,
    right: photoUriForRole(draft, "right") ?? undefined,
  };
  const otherPhotos = draft.photos.filter(
    (photo): photo is typeof photo & { role: "other" } => photo.role === "other",
  );
  const photoList = [
    ...UNIVERSAL_PHOTO_ROLES.filter((role) => universalPhotoUris[role]),
    ...otherPhotos.map((photo) => photo.uri),
  ];
  const selectedClub =
    draft.clubId && draft.clubLabel ? { id: draft.clubId, label: draft.clubLabel } : null;
  const selectedSeason =
    draft.seasonId && selectedSeasonLabel
      ? { id: draft.seasonId, label: selectedSeasonLabel }
      : null;
  const showAddPhotoSlot = canAddPhotoToDraft(draft);
  const dockHelper = saveBlockMessage ?? getSaveBlockMessage(draft);
  const saveEnabled = canSave(draft);
  const saveLabel =
    isBulk && state.drafts.length > 1 ? JERSEY_DETAILS_SAVE_AND_NEXT : JERSEY_DETAILS_PRIMARY_SAVE;
  const activeJerseyIndex =
    state?.drafts.findIndex((entry) => entry.id === state.activeDraftId) ?? -1;
  const activeTabLabel = activeJerseyIndex >= 0 ? `Trøje ${activeJerseyIndex + 1}` : "Trøje";

  return (
    <View style={[styles.container, { backgroundColor: theme.canvas }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={[typography.title, { color: theme.contentPrimary }]}>
          {JERSEY_DETAILS_TITLE}
        </Text>
        <Text style={[typography.body, { color: theme.contentMuted }]}>
          Vælg klub, sæson og detaljer.
        </Text>

        {isBulk && state ? (
          <BulkChrome
            state={state}
            onSelectDraft={handleSelectDraft}
            onAddJersey={handleAddJersey}
          />
        ) : null}

        <View style={styles.section}>
          <Text style={[typography.label, { color: theme.contentPrimary }]}>Fotos</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoRow}
          >
            {UNIVERSAL_PHOTO_ROLES.map((role) => (
              <PhotoSlot
                key={role}
                role={role}
                uri={universalPhotoUris[role]}
                onPress={() => handlePhotoSlotPress(role)}
              />
            ))}
            {otherPhotos.map((photo) => (
              <PhotoSlot
                key={photo.uri}
                role={photo.role}
                uri={photo.uri}
                caption={photo.label}
                onPress={() => {
                  setLightboxRole("other");
                  setLightboxUri(photo.uri);
                }}
              />
            ))}
            {showAddPhotoSlot ? (
              <PhotoSlot
                key="add-photo"
                role={ADD_PHOTO_ROLE}
                variant="add"
                onPress={handleAddPhotoPress}
              />
            ) : null}
          </ScrollView>
          {photoCapMessage ? (
            <Text style={[typography.caption, { color: theme.contentMuted }]}>
              {photoCapMessage}
            </Text>
          ) : null}
          {photoList.length === 0 ? (
            <Text style={[typography.caption, { color: theme.contentMuted }]}>
              Mindst ét foto er påkrævet.
            </Text>
          ) : photoList.length < UNIVERSAL_PHOTO_ROLES.length ? (
            <Text style={[typography.caption, { color: theme.contentMuted }]}>
              Fire universelle fotos anbefales — ekstra Andet-fotos er valgfrie.
            </Text>
          ) : null}
        </View>

        {state ? (
          <UnboundPhotosRow
            uris={state.unboundUris}
            activeTabLabel={activeTabLabel}
            onPressPhoto={handleBindUnboundPhoto}
            onDiscardPhoto={handleDiscardUnboundPhoto}
            onUpload={() => void handleUploadToSandbox()}
          />
        ) : null}

        {visionPolling ? (
          <View
            accessibilityLabel="Forslag indlæses"
            style={[styles.visionSkeleton, { backgroundColor: theme.surface }]}
          >
            <View style={[styles.visionSkeletonBar, { backgroundColor: theme.fillSecondary }]} />
            <View
              style={[styles.visionSkeletonBarShort, { backgroundColor: theme.fillSecondary }]}
            />
          </View>
        ) : null}

        {activeBanner === "visionSuggestion" && visionSuggestion?.suggestions ? (
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

        {activeBanner === "catalogMiss" ? (
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

        {!isBulk ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Flere trøjer i denne upload"
            accessibilityHint="Åbner binding af flere trøjer uden at vælge billeder igen"
            onPress={handleMoreJerseysInUpload}
            style={styles.detailsLink}
          >
            <Text style={[typography.label, { color: theme.contentSecondary }]}>
              Flere trøjer i denne upload
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <ButtonDock>
        {dockHelper ? (
          <Text style={[typography.caption, { color: theme.contentMuted }]}>{dockHelper}</Text>
        ) : null}
        <Button
          label={saveLabel}
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

      {lightboxRole !== null && lightboxUri ? (
        <PhotoLightbox
          visible
          role={lightboxRole}
          uri={lightboxUri}
          label={draft.photos.find((photo) => photo.uri === lightboxUri)?.label ?? ""}
          onDismiss={() => {
            setLightboxRole(null);
            setLightboxUri(null);
          }}
          onReplace={handleLightboxReplace}
          onDelete={handleLightboxDelete}
          onChangeRole={handleLightboxChangeRole}
          onChangeLabel={handleLightboxChangeLabel}
        />
      ) : null}
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
  visionSkeleton: {
    gap: space.gapSm,
    paddingVertical: space.insetSm,
  },
  visionSkeletonBar: {
    height: 12,
    width: "72%",
    borderRadius: radius.sm,
  },
  visionSkeletonBarShort: {
    height: 12,
    width: "44%",
    borderRadius: radius.sm,
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
