import type { CatalogPickerItem, CollectionJersey, VisionJobResponse } from "@kit/api-contract";
import { resolveVisionSaveAction } from "@kit/api-contract";
import type { PhotoRole } from "@kit/domain";
import { saveUserJersey, updateUserJersey } from "@/api/collection";
import { fetchVisionJob, logVisionAction } from "@/api/vision";
import { clearPersistedCaptureSession } from "@/capture/captureFlow";
import { completeOverviewDraft, unsavedDraftCount } from "@/capture/captureOverview";
import {
  addJerseyDraft,
  applyStickySizeToUnselected,
  hasCatalogSide,
  removeDraft,
} from "@/capture/captureSession";
import type {
  CaptureBranch,
  CaptureJerseyDraft,
  CaptureSessionState,
} from "@/capture/captureSessionTypes";
import { readPreparedPhotoBase64 } from "@/capture/photoBytes";
import { getSaveBlockMessage } from "@/capture/saveBlockMessage";
import { scheduleOriginalPhotoUploads } from "@/capture/uploadPhotoOriginal";
import { stickySize } from "@/prefs/stickySizeStore";
import { markJerseySaved } from "@/session/addSession";

export type ConfirmSaveOutcome =
  | { status: "blocked"; message: string }
  | { status: "missing-auth" }
  | { status: "edit-saved"; jerseyId: string }
  | { status: "bulk-continue" }
  /** Saved from the bulk overview: `remaining` jerseys are still unsaved. */
  | { status: "overview-continue"; remaining: number }
  | {
      status: "saved";
      club: CatalogPickerItem | null;
      seasonLabel: string | null;
      jersey: CollectionJersey;
    }
  | { status: "error" };

export async function saveConfirmJersey(input: {
  draft: CaptureJerseyDraft;
  sessionId: string;
  accessToken: string | null;
  editJerseyId?: string;
  visionJobId: string | null;
  selectedSeasonLabel: string | null;
  branch: CaptureBranch;
  mutate: (
    updater: (current: CaptureSessionState) => CaptureSessionState,
  ) => CaptureSessionState | null;
}): Promise<ConfirmSaveOutcome> {
  const block = getSaveBlockMessage(input.draft);
  if (block) {
    return { status: "blocked", message: block };
  }

  if (
    !input.accessToken ||
    !hasCatalogSide(input.draft) ||
    !input.draft.seasonId ||
    !input.draft.kitType ||
    !input.draft.size ||
    !input.draft.condition
  ) {
    return { status: "missing-auth" };
  }

  try {
    if (input.editJerseyId) {
      await updateUserJersey(input.accessToken, input.editJerseyId, {
        ...(input.draft.clubId
          ? { clubId: input.draft.clubId }
          : { nationalTeamId: input.draft.nationalTeamId! }),
        seasonId: input.draft.seasonId,
        catalogKitId: null,
        type: input.draft.kitType,
        size: input.draft.size,
        condition: input.draft.condition,
        playerId: input.draft.playerId ?? null,
        patchIds: input.draft.badgeId ? [input.draft.badgeId] : [],
      });
      clearPersistedCaptureSession(input.sessionId);
      return { status: "edit-saved", jerseyId: input.editJerseyId };
    }

    const photoPayload = await Promise.all(
      input.draft.photos
        .filter((photo): photo is typeof photo & { role: PhotoRole } => photo.role !== null)
        .map(async (photo) => ({
          role: photo.role,
          source: photo.source,
          contentBase64: await readPreparedPhotoBase64(photo.uri, photo.role, "display"),
        })),
    );

    const response = await saveUserJersey(input.accessToken, {
      draftId: input.draft.id,
      ...(input.draft.clubId
        ? { clubId: input.draft.clubId }
        : { nationalTeamId: input.draft.nationalTeamId! }),
      seasonId: input.draft.seasonId,
      catalogKitId: null,
      type: input.draft.kitType,
      size: input.draft.size,
      condition: input.draft.condition,
      playerId: input.draft.playerId ?? undefined,
      patchIds: input.draft.badgeId ? [input.draft.badgeId] : undefined,
      visionJobId: input.visionJobId ?? undefined,
      photos: photoPayload,
    });

    scheduleOriginalPhotoUploads(
      input.accessToken,
      input.draft.photos
        .filter((photo): photo is typeof photo & { role: PhotoRole } => photo.role !== null)
        .map((photo, index) => ({
          id: response.jersey.photos[index]?.id ?? "",
          uri: photo.uri,
          role: photo.role,
        }))
        .filter((entry) => entry.id.length > 0),
    );

    const jobIdForLog = response.visionJobId ?? input.visionJobId;
    if (jobIdForLog) {
      try {
        const job: VisionJobResponse = await fetchVisionJob(input.accessToken, jobIdForLog);
        const resolved = resolveVisionSaveAction({
          status: job.status,
          suggestions: job.suggestions,
          selectedClubId: input.draft.clubId ?? undefined,
          selectedNationalTeamId: input.draft.nationalTeamId ?? undefined,
          selectedSeasonId: input.draft.seasonId,
          selectedKitType: input.draft.kitType,
        });

        await logVisionAction(input.accessToken, {
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
    // Size is a sticky default (lock: Confirm and Save, Revision 2026-10-09). Condition is not.
    if (input.draft.size) {
      stickySize.remember(input.draft.size);
    }

    const savedClub = input.draft.clubLabel
      ? { id: input.draft.clubId!, label: input.draft.clubLabel }
      : input.draft.nationalTeamLabel && input.draft.nationalTeamId
        ? { id: input.draft.nationalTeamId, label: input.draft.nationalTeamLabel }
        : null;

    const savedSeasonLabel = response.jersey.seasonLabel ?? input.selectedSeasonLabel;

    if (input.branch === "bulk") {
      const nextState = input.mutate((current) => {
        // The bulk overview keeps the saved jersey as a Gemt row; other bulk sessions just drop it.
        let next = current.overview
          ? completeOverviewDraft(current, input.draft.id)
          : removeDraft(current, input.draft.id);
        if (!current.overview && next.drafts.length === 0 && next.unboundUris.length > 0) {
          next = addJerseyDraft(next, { defaultSize: stickySize.get() });
        }
        const lastSize = stickySize.get();
        return lastSize ? applyStickySizeToUnselected(next, lastSize) : next;
      });

      if (nextState?.overview) {
        return { status: "overview-continue", remaining: unsavedDraftCount(nextState) };
      }

      if (!nextState || nextState.drafts.length === 0) {
        clearPersistedCaptureSession(input.sessionId);
        return {
          status: "saved",
          club: savedClub,
          seasonLabel: savedSeasonLabel,
          jersey: response.jersey,
        };
      }

      return { status: "bulk-continue" };
    }

    clearPersistedCaptureSession(input.sessionId);
    return {
      status: "saved",
      club: savedClub,
      seasonLabel: savedSeasonLabel,
      jersey: response.jersey,
    };
  } catch {
    return { status: "error" };
  }
}
