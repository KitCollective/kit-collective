import type { PhotoSource } from "@kit/domain";
import * as Crypto from "expo-crypto";
import { createCaptureSession, setDraftClub } from "./captureSession";
import {
  clearActiveCameraCaptureSessionId,
  clearMemoryActiveCameraCaptureSessionIdForTests,
  setMemoryActiveCameraCaptureSessionIdForTests,
} from "./captureSessionActivePointer";
import type { PrefilledClub } from "./captureSessionPersistence";
import {
  loadPersistedCaptureSession,
  persistCameraShotInSession,
  replacePersistedCapturePhotos,
  resolveResumableCameraSession,
} from "./captureSessionPersistence";
import { createSqliteCaptureSessionStore } from "./captureSessionSqliteStore";
import type { CaptureBranch, CaptureSessionState } from "./captureSessionTypes";
import { mergeGalleryEscapePhotos } from "./galleryEscape";

export type { PrefilledClub };
export {
  clearActiveCameraCaptureSessionId,
  clearMemoryActiveCameraCaptureSessionIdForTests,
  loadPersistedCaptureSession,
  mergeGalleryEscapePhotos,
  persistCameraShotInSession,
  replacePersistedCapturePhotos,
  resolveResumableCameraSession,
  setMemoryActiveCameraCaptureSessionIdForTests,
};

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

export function withPersistedCaptureSession(
  sessionId: string,
  state: CaptureSessionState,
): CaptureSessionState {
  const store = createSqliteCaptureSessionStore(sessionId);
  return { ...state, store };
}

export function clearPersistedCaptureSession(sessionId: string): void {
  createSqliteCaptureSessionStore(sessionId).clear();
  clearActiveCameraCaptureSessionId();
}
