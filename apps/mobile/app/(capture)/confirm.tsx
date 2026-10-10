import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { addJerseyDraft, setActiveDraft, switchSingleToBulkBind } from "@/capture/captureSession";
import {
  confirmSaveEnabled,
  hasPendingLowConfidence,
  resolveIdentityBlock,
} from "@/capture/confirmIdentityBlock";
import { confirmJerseyIndexPlacement } from "@/capture/confirmPhotoStrip";
import { visionMatcherRemainingToOutOfQuota } from "@/capture/confirmVisionQuota";
import { shouldHoldIdentityForGrouping } from "@/capture/identityDraftQueue";
import { warmDevicePrepareForDraftRuntime } from "@/capture/photoPrepareRuntime";
import { scanLineLedger } from "@/capture/scanLineLedger";
import { useConfirmExit } from "@/capture/use-confirm-exit";
import { useConfirmGrouping } from "@/capture/use-confirm-grouping";
import { useConfirmPhotos } from "@/capture/use-confirm-photos";
import { useConfirmVision } from "@/capture/use-confirm-vision";
import { useConfirmSave } from "@/capture/useConfirmSave";
import { JerseyTabBar, jerseyTabBarWidth } from "@/components/bulk/JerseyTabBar";
import { UnboundPhotosRow } from "@/components/bulk/UnboundPhotosRow";
import { ConfirmHubHeader, confirmHubHeaderScrollPadding } from "@/components/confirm-hub-header";
import { ConfirmIdentityBlock } from "@/components/confirm-identity-block";
import { ConfirmPhotoViewer } from "@/components/confirm-photo-viewer";
import { ConfirmSectionRow } from "@/components/confirm-section-row";
import { ConfirmSizeCondition } from "@/components/confirm-size-condition";
import { ConfirmVisionSlot } from "@/components/confirm-vision-slot";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { PostSaveSheet } from "@/components/post-save-sheet";
import { BUTTON_DOCK_FADE_SCROLL_PADDING, Button, ButtonDock } from "@/components/ui";
import { stickySize } from "@/prefs/stickySizeStore";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

export default function ConfirmScreen() {
  const router = useRouter();
  const theme = useTheme();
  const typography = useTypography();
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const { sessionId, editJerseyId } = useLocalSearchParams<{
    sessionId: string;
    editJerseyId?: string;
  }>();
  const { accessToken, requestPremiumAccess, entitlement } = useAuth();
  const [visionJobId, setVisionJobId] = useState<string | null>(null);
  const [catalogMiss, setCatalogMiss] = useState(false);
  const {
    state,
    isSessionResolved,
    mutate,
    draft,
    isBulk,
    saving,
    postSaveOpen,
    savedClub,
    savedSeasonLabel,
    savedJersey,
    savedCount,
    setSelectedSeasonLabel,
    saveLabel,
    handleSave,
    handlePostSaveDismiss,
  } = useConfirmSave({ sessionId, editJerseyId, visionJobId });

  const exitToCollection = useConfirmExit(sessionId, state, isSessionResolved);
  const grouping = useConfirmGrouping({
    accessToken,
    sessionId,
    state,
    mutate,
    reduceMotion,
  });
  const vision = useConfirmVision({
    accessToken,
    sessionId,
    draft,
    sessionDrafts: state?.drafts ?? [],
    mutate,
    reduceMotion,
    jobId: visionJobId,
    setJobId: setVisionJobId,
    setSelectedSeasonLabel,
    onCatalogMiss: setCatalogMiss,
    onPremiumRequired: requestPremiumAccess,
    deferIdentity: shouldHoldIdentityForGrouping({
      groupingInFlight: grouping.blocksIdentity,
      boundDraftCount: (state?.drafts ?? []).filter((entry) => entry.photos.length > 0).length,
    }),
    groupingInFlight: grouping.blocksIdentity,
  });
  const photos = useConfirmPhotos({
    sessionId,
    state,
    draft,
    isBulk,
    mutate,
    onFirstSinglePhoto: () => {},
  });

  useEffect(() => {
    if (!draft) {
      return;
    }
    warmDevicePrepareForDraftRuntime(draft);
  }, [draft]);
  const [scanFront, setScanFront] = useState(false);
  const frontPhoto = draft?.photos.find((photo) => (photo.role ?? "front") === "front");
  const frontPhotoKey = frontPhoto ? (frontPhoto.photoId ?? frontPhoto.uri) : null;
  const visionAnalyzing = vision.analyzing;

  // The scan line runs once per photo, on its first identity read; never on a reopen.
  useEffect(() => {
    if (!visionAnalyzing) {
      setScanFront(false);
      return;
    }
    if (scanLineLedger.shouldRun(frontPhotoKey, { inFlight: true, reduceMotion })) {
      setScanFront(true);
    }
  }, [frontPhotoKey, reduceMotion, visionAnalyzing]);

  const handleSelectDraft = (draftId: string) => {
    mutate((current) => setActiveDraft(current, draftId));
  };

  const handleAddJersey = () => {
    mutate((current) =>
      addJerseyDraft(current.branch === "single" ? switchSingleToBulkBind(current) : current, {
        defaultSize: stickySize.get(),
      }),
    );
  };

  const openSection = (section: "data" | "details") => {
    if (!sessionId) {
      return;
    }
    router.push({
      pathname: section === "data" ? "/(capture)/confirm-data" : "/(capture)/confirm-details",
      params: {
        sessionId,
        ...(editJerseyId ? { editJerseyId } : {}),
        ...(section === "data" && vision.catalogMissHint
          ? { visionSideHint: vision.catalogMissHint }
          : {}),
      },
    });
  };

  const fadeDockScrollPadding =
    BUTTON_DOCK_FADE_SCROLL_PADDING + Math.max(insets.bottom, space.insetMd);

  if (!sessionId || !draft || !photos.photoUris) {
    return null;
  }

  const activeJerseyIndex = state?.drafts.findIndex((entry) => entry.id === draft.id) ?? 0;
  const activeTabLabel = `Trøje ${activeJerseyIndex + 1}`;
  const outOfQuota = visionMatcherRemainingToOutOfQuota(entitlement?.visionMatcher);
  const visionOn = Boolean(accessToken) && !outOfQuota && !editJerseyId;
  const settled = vision.settledDraftIds.has(draft.id);
  // A read is running, queued behind grouping, or about to start for this jersey.
  const identityInFlight =
    vision.analyzing ||
    grouping.blocksIdentity ||
    (visionOn && draft.photos.length > 0 && !settled);
  const identitySuggestion = vision.suggestion?.suggestions ?? null;
  const lowConfidencePending = !identityInFlight && hasPendingLowConfidence(identitySuggestion);
  const identityBlock = resolveIdentityBlock({
    draft,
    visionOn,
    inFlight: identityInFlight,
    filledByVision: vision.filledByVision,
    suggestion: identitySuggestion,
  });
  const saveEnabled = confirmSaveEnabled({ draft, lowConfidencePending });
  const jerseyCount = state?.drafts.length ?? 1;
  const indexPlacement = confirmJerseyIndexPlacement(jerseyCount);
  const unboundUris = (state?.unboundUris ?? []).filter(
    (uri) => !grouping.hiddenSandboxUris.includes(uri),
  );
  const showSandbox = unboundUris.length > 0 || grouping.blocksIdentity;

  const jerseyIndex = state ? (
    <JerseyTabBar
      drafts={state.drafts}
      activeDraftId={state.activeDraftId}
      onSelectDraft={handleSelectDraft}
      onAddJersey={handleAddJersey}
      analyzing={grouping.blocksIdentity}
      showPhotoCount={indexPlacement === "row"}
    />
  ) : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.canvas }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: confirmHubHeaderScrollPadding(insets.top, {
              withIndex: indexPlacement === "header",
            }),
            paddingBottom: fadeDockScrollPadding,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {indexPlacement === "row" ? jerseyIndex : null}

        <View style={styles.photoStack}>
          <ConfirmPhotoViewer
            photoUris={photos.photoUris}
            photoCount={draft.photos.length}
            onPressRole={photos.handlePhotoSlotPress}
            onAddPhoto={() => void photos.addPhoto()}
            analyzing={grouping.blocksIdentity}
            rollingUris={grouping.rollingUris}
            homecoming={grouping.homecoming}
            scanningFront={scanFront}
          />

          {showSandbox ? (
            <View style={styles.sandbox}>
              {unboundUris.length > 0 ? (
                <Text style={[typography.caption, { color: theme.contentSecondary }]}>
                  {unboundUris.length === 1
                    ? "1 foto uden trøje"
                    : `${unboundUris.length} fotos uden trøje`}
                </Text>
              ) : null}
              <UnboundPhotosRow
                uris={unboundUris}
                activeTabLabel={activeTabLabel}
                onPressPhoto={photos.bindUnboundPhoto}
                onDiscardPhoto={photos.discardUnboundPhoto}
                analyzing={grouping.blocksIdentity}
                gatheringUris={grouping.gatheringUris}
              />
            </View>
          ) : null}
        </View>

        {grouping.blocksIdentity ? (
          <View style={styles.visionSlotReserve} accessibilityElementsHidden />
        ) : (
          <ConfirmVisionSlot
            groupingMessage={grouping.groupingMessage}
            catalogMiss={catalogMiss}
            catalogMissHint={vision.catalogMissHint}
            suggestionOpacity={grouping.suggestionOpacity}
            onApplySuggestion={() => grouping.applySuggestion()}
            onDismissSuggestion={grouping.dismissSuggestion}
          />
        )}

        <ConfirmIdentityBlock
          model={identityBlock}
          onOpenData={() => openSection("data")}
          onApplySuggestion={() => void vision.applySuggestion()}
          onChooseMyself={() => {
            vision.dismissSuggestion();
            openSection("data");
          }}
        />

        <ConfirmSizeCondition draft={draft} mutate={mutate} />

        <View style={styles.hubSpacer} />

        <ConfirmSectionRow
          title="Badge og noter"
          meta="valgfrit"
          testID="confirm-section-details"
          onPress={() => openSection("details")}
        />
      </ScrollView>

      <ConfirmHubHeader
        onClose={exitToCollection}
        trailing={
          indexPlacement === "header" ? (
            <View style={{ width: jerseyTabBarWidth(1), flexShrink: 0 }}>{jerseyIndex}</View>
          ) : null
        }
      />

      <ButtonDock variant="fade">
        <Button
          label={saveLabel}
          testID="confirm-save"
          variant="primary"
          width="fill"
          loading={saving}
          disabled={!saveEnabled}
          onPress={() => void handleSave()}
        />
      </ButtonDock>

      <PostSaveSheet
        visible={postSaveOpen}
        savedClub={savedClub}
        savedSeasonLabel={savedSeasonLabel}
        savedJersey={savedJersey}
        savedCount={savedCount}
        onDismiss={handlePostSaveDismiss}
      />

      {photos.lightboxRole !== null && photos.lightboxUri ? (
        <PhotoLightbox
          visible
          role={photos.lightboxRole}
          uri={photos.lightboxUri}
          onDismiss={photos.dismissLightbox}
          onReplace={photos.replaceLightboxPhoto}
          onDelete={photos.deleteLightboxPhoto}
          onChangeRole={photos.changeLightboxPhotoRole}
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
    flexGrow: 1,
    padding: space.insetLg,
    gap: space.gapLg,
  },
  hubSpacer: {
    flexGrow: 1,
  },
  // Tighter than the column's gapLg so the sandbox reads as attached to the viewer.
  photoStack: {
    gap: space.gapMd,
  },
  sandbox: {
    gap: space.gapSm,
  },
  // Holds the Vision slot's height while grouping hides it, so the column does not hop.
  visionSlotReserve: {
    minHeight: 44,
  },
});
