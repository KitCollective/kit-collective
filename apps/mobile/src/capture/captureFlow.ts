import type { PhotoSource } from "@kit/domain";
import * as Crypto from "expo-crypto";
import { Alert } from "react-native";
import {
  branchFromPhotoCount,
  createCaptureSession,
  createCaptureSessionFromPhotos,
  setDraftClub,
} from "./captureSession";
import { createSqliteCaptureSessionStore } from "./captureSessionSqliteStore";
import type {
  CaptureBranch,
  CaptureSessionPhoto,
  CaptureSessionState,
} from "./captureSessionTypes";

export type { PrefilledClub } from "./captureSessionPersistence";
export {
  loadPersistedCaptureSession,
  persistCameraShotInSession,
  replacePersistedCapturePhotos,
} from "./captureSessionPersistence";

import type { PrefilledClub } from "./captureSessionPersistence";

export { mergeGalleryEscapePhotos } from "./galleryEscape";

export function readPrefilledClub(params: {
  prefilledClubId?: string | string[];
  prefilledClubLabel?: string | string[];
}): PrefilledClub | null {
  const clubId = Array.isArray(params.prefilledClubId)
    ? params.prefilledClubId[0]
    : params.prefilledClubId;
  const clubLabel = Array.isArray(params.prefilledClubLabel)
    ? params.prefilledClubLabel[0]
    : params.prefilledClubLabel;

  if (!clubId || !clubLabel) {
    return null;
  }

  return { id: clubId, label: clubLabel };
}

export function showBulkUploadBlockedAlert(): void {
  Alert.alert(
    "For mange billeder",
    "Du har valgt mere end tre billeder. Vælg op til tre billeder for én trøje.",
  );
}

export function createPersistedCaptureSession(
  orderedUris: string[],
  options?: {
    prefilledClub?: PrefilledClub | null;
    sessionId?: string;
    photoSource?: PhotoSource;
  },
): { sessionId: string; branch: CaptureBranch } {
  const sessionId = options?.sessionId ?? Crypto.randomUUID();
  const store = createSqliteCaptureSessionStore(sessionId);
  let state = createCaptureSession(orderedUris, {
    store,
    sessionId,
    photoSource: options?.photoSource ?? "gallery",
  });

  if (options?.prefilledClub) {
    state = setDraftClub(
      state,
      state.activeDraftId,
      options.prefilledClub.id,
      options.prefilledClub.label,
    );
  }

  return { sessionId, branch: state.branch };
}

export function createPersistedCaptureSessionFromPhotos(
  photos: CaptureSessionPhoto[],
  options?: {
    prefilledClub?: PrefilledClub | null;
    sessionId?: string;
  },
): { sessionId: string; branch: CaptureBranch } {
  const sessionId = options?.sessionId ?? Crypto.randomUUID();
  const store = createSqliteCaptureSessionStore(sessionId);
  let state = createCaptureSessionFromPhotos(photos, {
    store,
    sessionId,
  });

  if (options?.prefilledClub) {
    state = setDraftClub(
      state,
      state.activeDraftId,
      options.prefilledClub.id,
      options.prefilledClub.label,
    );
  }

  return { sessionId, branch: state.branch };
}

export function withPersistedCaptureSession(
  sessionId: string,
  state: CaptureSessionState,
): CaptureSessionState {
  const store = createSqliteCaptureSessionStore(sessionId);
  return { ...state, store };
}

export function clearPersistedCaptureSession(sessionId: string): void {
  createSqliteCaptureSessionStore(sessionId).clear();
}

export function isBulkUpload(photoCount: number): boolean {
  return branchFromPhotoCount(photoCount) === "bulk";
}
