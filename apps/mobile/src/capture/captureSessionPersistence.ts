import type { PhotoRole, PhotoSource } from "@kit/domain";
import {
  appendCameraShotToSession,
  createCaptureSessionFromPhotos,
  getActiveDraft,
  setDraftClub,
} from "./captureSession";
import {
  clearActiveCameraCaptureSessionId,
  getActiveCameraCaptureSessionId,
  setActiveCameraCaptureSessionId,
} from "./captureSessionActivePointer";
import type {
  CaptureSessionPhoto,
  CaptureSessionState,
  CaptureSessionStore,
} from "./captureSessionTypes";

export type PrefilledClub = {
  id: string;
  label: string;
};

function createSessionId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `capture-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sqliteStore(sessionId: string): CaptureSessionStore {
  const { createSqliteCaptureSessionStore } =
    require("./captureSessionSqliteStore") as typeof import("./captureSessionSqliteStore");
  return createSqliteCaptureSessionStore(sessionId);
}

function sessionStore(sessionId: string, testStore?: CaptureSessionStore): CaptureSessionStore {
  return testStore ?? sqliteStore(sessionId);
}

function persistCaptureSessionFromPhotos(
  photos: CaptureSessionPhoto[],
  options?: {
    prefilledClub?: PrefilledClub | null;
    sessionId?: string;
    store?: CaptureSessionStore;
  },
): string {
  const sessionId = options?.sessionId ?? createSessionId();
  const store = sessionStore(sessionId, options?.store);
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
  return sqliteStore(sessionId).load();
}

export function persistCameraShotInSession(
  sessionId: string | null,
  photo: CaptureSessionPhoto & { role: PhotoRole },
  options?: {
    prefilledClub?: PrefilledClub | null;
    photoSource?: PhotoSource;
    store?: CaptureSessionStore;
  },
): string {
  const source = options?.photoSource ?? "camera";

  if (!sessionId) {
    const newSessionId = createSessionId();
    persistCaptureSessionFromPhotos([{ ...photo, source }], {
      sessionId: newSessionId,
      prefilledClub: options?.prefilledClub,
      store: options?.store,
    });
    setActiveCameraCaptureSessionId(newSessionId);
    return newSessionId;
  }

  const store = sessionStore(sessionId, options?.store);
  const loaded = store.load();
  if (!loaded) {
    return persistCameraShotInSession(null, photo, options);
  }

  const next = appendCameraShotToSession(
    { ...loaded, store: sessionStore(sessionId, options?.store) },
    photo,
    source,
  );
  next.store?.save(next);
  setActiveCameraCaptureSessionId(sessionId);
  return sessionId;
}

export function replacePersistedCapturePhotos(
  sessionId: string | null,
  photos: CaptureSessionPhoto[],
  options?: {
    prefilledClub?: PrefilledClub | null;
    store?: CaptureSessionStore;
  },
): string {
  if (!sessionId) {
    return persistCaptureSessionFromPhotos(photos, {
      prefilledClub: options?.prefilledClub,
      store: options?.store,
    });
  }

  const store = sessionStore(sessionId, options?.store);
  const loaded = store.load();
  if (!loaded) {
    return replacePersistedCapturePhotos(null, photos, options);
  }

  return persistCaptureSessionFromPhotos(photos, {
    sessionId,
    prefilledClub: options?.prefilledClub,
    store,
  });
}

export function resolveResumableCameraSession(options?: {
  readSession?: (sessionId: string) => CaptureSessionState | null;
}): {
  sessionId: string;
  photos: Array<{ role: PhotoRole; uri: string }>;
} | null {
  const sessionId = getActiveCameraCaptureSessionId();
  if (!sessionId) {
    return null;
  }

  const readSession = options?.readSession ?? loadPersistedCaptureSession;
  const loaded = readSession(sessionId);
  if (loaded?.branch !== "single") {
    clearActiveCameraCaptureSessionId();
    return null;
  }

  const draft = getActiveDraft(loaded);
  const photos = draft.photos
    .filter((photo): photo is CaptureSessionPhoto & { role: PhotoRole } => photo.role !== null)
    .map((photo) => ({ role: photo.role, uri: photo.uri }));

  if (photos.length === 0) {
    clearActiveCameraCaptureSessionId();
    return null;
  }

  return { sessionId, photos };
}
