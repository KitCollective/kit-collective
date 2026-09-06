import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { addJerseyDraft, setActiveDraft, switchSingleToBulkBind } from "@/capture/captureSession";
import {
  DATA_REQUIRED_COUNT,
  DETAILS_REQUIRED_COUNT,
  dataRequiredFilledCount,
  dataSectionFacts,
  detailsRequiredFilledCount,
  detailsSectionFacts,
} from "@/capture/confirmSectionProgress";
import { warmDevicePrepareForDraftRuntime } from "@/capture/photoPrepareRuntime";
import { useConfirmExit } from "@/capture/use-confirm-exit";
import { useConfirmPhotos } from "@/capture/use-confirm-photos";
import { useConfirmVision } from "@/capture/use-confirm-vision";
import { useConfirmSave } from "@/capture/useConfirmSave";
import { JerseyTabBar } from "@/components/bulk/JerseyTabBar";
import { UnboundPhotosRow } from "@/components/bulk/UnboundPhotosRow";
import { ConfirmHubHeader, confirmHubHeaderScrollPadding } from "@/components/confirm-hub-header";
import { ConfirmPhotoViewer } from "@/components/confirm-photo-viewer";
import { ConfirmSectionRow } from "@/components/confirm-section-row";
import { ConfirmVisionSlot } from "@/components/confirm-vision-slot";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { PostSaveSheet } from "@/components/post-save-sheet";
import { BUTTON_DOCK_FADE_SCROLL_PADDING, Button, ButtonDock } from "@/components/ui";
import { space } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

export default function ConfirmScreen() {
  const router = useRouter();
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const { sessionId, editJerseyId } = useLocalSearchParams<{
    sessionId: string;
    editJerseyId?: string;
  }>();
  const { accessToken } = useAuth();
  const [visionJobId, setVisionJobId] = useState<string | null>(null);
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
    setSelectedSeasonLabel,
    saveEnabled,
    saveLabel,
    handleSave,
    handlePostSaveDismiss,
  } = useConfirmSave({ sessionId, editJerseyId, visionJobId });

  const exitToCollection = useConfirmExit(sessionId, state, isSessionResolved);
  const vision = useConfirmVision({
    accessToken,
    sessionId,
    draft,
    mutate,
    reduceMotion,
    jobId: visionJobId,
    setJobId: setVisionJobId,
    setSelectedSeasonLabel,
  });
  const photos = useConfirmPhotos({
    sessionId,
    state,
    draft,
    isBulk,
    mutate,
    onFirstSinglePhoto: (role, uri) => void vision.startVision(role, uri),
  });

  useEffect(() => {
    if (!draft) {
      return;
    }
    warmDevicePrepareForDraftRuntime(draft);
  }, [draft]);
  const [dataSectionHeight, setDataSectionHeight] = useState(0);
  const [detailsSectionHeight, setDetailsSectionHeight] = useState(0);
  const sectionMinHeight = Math.max(dataSectionHeight, detailsSectionHeight) || undefined;

  const handleSelectDraft = (draftId: string) => {
    mutate((current) => setActiveDraft(current, draftId));
  };

  const handleAddJersey = () => {
    mutate((current) =>
      addJerseyDraft(current.branch === "single" ? switchSingleToBulkBind(current) : current),
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
  const lightboxUri = photos.lightboxRole ? photos.photoUris[photos.lightboxRole] : undefined;

  return (
    <View style={[styles.container, { backgroundColor: theme.canvas }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: confirmHubHeaderScrollPadding(insets.top),
            paddingBottom: fadeDockScrollPadding,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {state ? (
          <JerseyTabBar
            drafts={state.drafts}
            activeDraftId={state.activeDraftId}
            onSelectDraft={handleSelectDraft}
            onAddJersey={handleAddJersey}
          />
        ) : null}

        <View style={styles.photoStack}>
          <ConfirmPhotoViewer
            photoUris={photos.photoUris}
            onPressRole={photos.handlePhotoSlotPress}
          />

          {state ? (
            <UnboundPhotosRow
              uris={state.unboundUris}
              activeTabLabel={activeTabLabel}
              onPressPhoto={photos.bindUnboundPhoto}
              onDiscardPhoto={photos.discardUnboundPhoto}
              onUpload={() => void photos.uploadToSandbox()}
            />
          ) : null}
        </View>

        <ConfirmVisionSlot
          bannerState={vision.bannerState}
          suggestion={vision.suggestion}
          suggestionOpacity={vision.suggestionOpacity}
          onApplySuggestion={() => void vision.applySuggestion()}
          onDismissSuggestion={vision.dismissSuggestion}
        />

        <View style={styles.hubSpacer} />

        <View style={styles.sectionPair}>
          <ConfirmSectionRow
            title="Data"
            facts={dataSectionFacts(draft)}
            filled={dataRequiredFilledCount(draft)}
            required={DATA_REQUIRED_COUNT}
            minHeight={sectionMinHeight}
            onMeasureHeight={setDataSectionHeight}
            onPress={() => openSection("data")}
          />
          <ConfirmSectionRow
            title="Detaljer"
            facts={detailsSectionFacts(draft)}
            filled={detailsRequiredFilledCount(draft)}
            required={DETAILS_REQUIRED_COUNT}
            minHeight={sectionMinHeight}
            onMeasureHeight={setDetailsSectionHeight}
            onPress={() => openSection("details")}
          />
        </View>
      </ScrollView>

      <ConfirmHubHeader onClose={exitToCollection} />

      <ButtonDock variant="fade">
        <Button
          label={saveLabel}
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
        onDismiss={handlePostSaveDismiss}
      />

      {photos.lightboxRole !== null && lightboxUri ? (
        <PhotoLightbox
          visible
          role={photos.lightboxRole}
          uri={lightboxUri}
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
  sectionPair: {
    flexDirection: "column",
    gap: space.gapMd,
  },
});
