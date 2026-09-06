import type { CatalogPickerItem } from "@kit/api-contract";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { fetchClubSeasons } from "@/api/catalog";
import { useAuth } from "@/auth/AuthProvider";
import { canSave } from "@/capture/captureSession";
import { getSaveBlockMessage } from "@/capture/saveBlockMessage";
import { saveConfirmJersey } from "@/capture/saveConfirmJersey";
import { showSaveFailureToast } from "@/capture/saveFailureToast";
import { usePersistedCaptureSession } from "@/capture/usePersistedCaptureSession";

export function useConfirmSave(options: {
  sessionId: string | undefined;
  editJerseyId?: string;
  visionJobId?: string | null;
  afterBulkContinue?: "hub" | "stay";
}) {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { state, isSessionResolved, mutate, refresh } = usePersistedCaptureSession(
    options.sessionId,
  );
  const [saving, setSaving] = useState(false);
  const [saveBlockMessage, setSaveBlockMessage] = useState<string | null>(null);
  const [postSaveOpen, setPostSaveOpen] = useState(false);
  const [savedClub, setSavedClub] = useState<CatalogPickerItem | null>(null);
  const [savedSeasonLabel, setSavedSeasonLabel] = useState<string | null>(null);
  const [selectedSeasonLabel, setSelectedSeasonLabel] = useState<string | null>(null);

  const draft =
    state?.drafts.find((entry) => entry.id === state.activeDraftId) ?? state?.drafts[0] ?? null;
  const isBulk = state?.branch === "bulk";

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (!accessToken || !draft?.clubId) {
      return;
    }

    let cancelled = false;
    void fetchClubSeasons(accessToken, draft.clubId).then((response) => {
      if (cancelled) {
        return;
      }
      if (draft.seasonId) {
        const match = response.seasons.find((season) => season.id === draft.seasonId);
        if (match) {
          setSelectedSeasonLabel(match.label);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, draft?.clubId, draft?.seasonId]);

  const handleSave = async () => {
    if (!draft || !options.sessionId || !state) {
      return;
    }

    setSaving(true);

    const outcome = await saveConfirmJersey({
      draft,
      sessionId: options.sessionId,
      accessToken,
      editJerseyId: options.editJerseyId,
      visionJobId: options.visionJobId ?? null,
      selectedSeasonLabel,
      branch: state.branch,
      mutate,
    });

    setSaving(false);

    if (outcome.status === "blocked") {
      setSaveBlockMessage(outcome.message);
      return;
    }

    if (outcome.status === "error") {
      // Fire-and-forget danger toast with a Prøv igen retry — Save never waits on it.
      showSaveFailureToast(() => void handleSave());
      return;
    }

    if (outcome.status === "edit-saved") {
      router.replace(`/(tabs)/collection/${outcome.jerseyId}`);
      return;
    }

    if (outcome.status === "saved") {
      setSavedClub(outcome.club);
      setSavedSeasonLabel(outcome.seasonLabel);
      setPostSaveOpen(true);
      return;
    }

    if (
      outcome.status === "bulk-continue" &&
      options.afterBulkContinue === "hub" &&
      options.sessionId
    ) {
      router.replace({
        pathname: "/(capture)/confirm",
        params: { sessionId: options.sessionId },
      });
    }
  };

  const handleCommitDrill = () => {
    if (state) {
      mutate((current) => current);
    }
    router.back();
  };

  const handlePostSaveDismiss = () => {
    setPostSaveOpen(false);
    router.replace("/(tabs)/collection");
  };

  const dockHelper = saveBlockMessage ?? (draft ? getSaveBlockMessage(draft) : null);
  const saveEnabled = draft ? canSave(draft) : false;
  const saveLabel = options.editJerseyId
    ? "Gem"
    : isBulk && state && state.drafts.length > 1
      ? "Gem og næste"
      : "Gem";

  return {
    state,
    isSessionResolved,
    mutate,
    draft,
    isBulk,
    saving,
    postSaveOpen,
    savedClub,
    savedSeasonLabel,
    selectedSeasonLabel,
    setSelectedSeasonLabel,
    dockHelper,
    saveEnabled,
    saveLabel,
    handleSave,
    handleCommitDrill,
    handlePostSaveDismiss,
  };
}
