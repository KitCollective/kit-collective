import type { PhotoRole, PhotoSource } from "@kit/domain";
import * as Crypto from "expo-crypto";
import {
  appendCameraShotToSession,
  createCaptureSessionFromPhotos,
  setDraftClub,
} from "./captureSession";
import { createSqliteCaptureSessionStore } from "./captureSessionSqliteStore";
import type { CaptureSessionPhoto, CaptureSessionState } from "./captureSessionTypes";

export type PrefilledClub = {
  id: string;
  label: string;
};

function withStore(sessionId: string, state: CaptureSessionState): CaptureSessionState {
  return { ...state, store: createSqliteCaptureSessionStore(sessionId) };
}

function persistCaptureSessionFromPhotos(
  photos: CaptureSessionPhoto[],
  options?: {
    prefilledClub?: PrefilledClub | null;
    sessionId?: string;
  },
): string {
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

  return sessionId;
}

export function loadPersistedCaptureSession(sessionId: string): CaptureSessionState | null {
  return createSqliteCaptureSessionStore(sessionId).load();
}

export function persistCameraShotInSession(
  sessionId: string | null,
  photo: CaptureSessionPhoto & { role: PhotoRole },
  options?: {
    prefilledClub?: PrefilledClub | null;
    photoSource?: PhotoSource;
  },
): string {
  const source = options?.photoSource ?? "camera";

  if (!sessionId) {
    const newSessionId = Crypto.randomUUID();
    persistCaptureSessionFromPhotos([{ ...photo, source }], {
      sessionId: newSessionId,
      prefilledClub: options?.prefilledClub,
    });
    return newSessionId;
  }

  const loaded = loadPersistedCaptureSession(sessionId);
  if (!loaded) {
    return persistCameraShotInSession(null, photo, options);
  }

  const next = appendCameraShotToSession(withStore(sessionId, loaded), photo, source);
  next.store?.save(next);
  return sessionId;
}

export function replacePersistedCapturePhotos(
  sessionId: string | null,
  photos: CaptureSessionPhoto[],
  options?: {
    prefilledClub?: PrefilledClub | null;
  },
): string {
  if (!sessionId) {
    return persistCaptureSessionFromPhotos(photos, {
      prefilledClub: options?.prefilledClub,
    });
  }

  const loaded = loadPersistedCaptureSession(sessionId);
  if (!loaded) {
    return replacePersistedCapturePhotos(null, photos, options);
  }

  createSqliteCaptureSessionStore(sessionId).clear();
  return persistCaptureSessionFromPhotos(photos, {
    sessionId,
    prefilledClub: options?.prefilledClub,
  });
}
