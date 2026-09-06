import type { CatalogPickerItem, VisionJobResponse } from "@kit/api-contract";
import { resolveVisionSaveAction } from "@kit/api-contract";
import type { PhotoRole } from "@kit/domain";
import { saveUserJersey, updateUserJersey } from "@/api/collection";
import { fetchVisionJob, logVisionAction } from "@/api/vision";
import { clearPersistedCaptureSession } from "@/capture/captureFlow";
import { addJerseyDraft, removeDraft } from "@/capture/captureSession";
import type {
  CaptureBranch,
  CaptureJerseyDraft,
  CaptureSessionState,
} from "@/capture/captureSessionTypes";
import { readPreparedPhotoBase64 } from "@/capture/photoBytes";
import { scheduleOriginalPhotoUploads } from "@/capture/uploadPhotoOriginal";
import { getSaveBlockMessage } from "@/capture/saveBlockMessage";
import { markJerseySaved } from "@/session/addSession";

export type ConfirmSaveOutcome =
  | { status: "blocked"; message: string }
  | { status: "missing-auth" }
  | { status: "edit-saved"; jerseyId: string }
  | { status: "bulk-continue" }
  | {
      status: "saved";
      club: CatalogPickerItem | null;
      seasonLabel: string | null;
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
    !input.draft.clubId ||
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
        clubId: input.draft.clubId,
        seasonId: input.draft.seasonId,
        catalogKitId: null,
        type: input.draft.kitType,
        size: input.draft.size,
        condition: input.draft.condition,
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
      clubId: input.draft.clubId,
      seasonId: input.draft.seasonId,
      catalogKitId: null,
      type: input.draft.kitType,
      size: input.draft.size,
      condition: input.draft.condition,
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
          selectedClubId: input.draft.clubId,
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

    const savedClub = input.draft.clubLabel
      ? { id: input.draft.clubId, label: input.draft.clubLabel }
      : null;

    if (input.branch === "bulk") {
      const nextState = input.mutate((current) => {
        let next = removeDraft(current, input.draft.id);
        if (next.drafts.length === 0 && next.unboundUris.length > 0) {
          next = addJerseyDraft(next);
        }
        return next;
      });

      if (!nextState || nextState.drafts.length === 0) {
        clearPersistedCaptureSession(input.sessionId);
        return { status: "saved", club: savedClub, seasonLabel: input.selectedSeasonLabel };
      }

      return { status: "bulk-continue" };
    }

    clearPersistedCaptureSession(input.sessionId);
    return { status: "saved", club: savedClub, seasonLabel: input.selectedSeasonLabel };
  } catch {
    return { status: "error" };
  }
}
