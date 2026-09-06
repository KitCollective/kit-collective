import type { PhotoSource } from "@kit/domain";
import {
  appendUnassignedCameraShotToSession,
  applyFillOrderToActiveDraft,
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
  const { createSqliteCaptureSessionStore } = require("./captureSessionSqliteStore") satisfies {
    createSqliteCaptureSessionStore: (id: string) => CaptureSessionStore;
  };
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
  photo: { uri: string; source?: PhotoSource },
  options?: {
    prefilledClub?: PrefilledClub | null;
    photoSource?: PhotoSource;
    store?: CaptureSessionStore;
  },
): string {
  const source = photo.source ?? options?.photoSource ?? "camera";

  if (!sessionId) {
    const newSessionId = createSessionId();
    persistCaptureSessionFromPhotos([{ uri: photo.uri, role: null, source }], {
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

  const next = appendUnassignedCameraShotToSession(
    { ...loaded, store: sessionStore(sessionId, options?.store) },
    photo.uri,
    source,
  );
  next.store?.save(next);
  setActiveCameraCaptureSessionId(sessionId);
  return sessionId;
}

export function finalizeShootFirstSession(
  sessionId: string,
  options?: { store?: CaptureSessionStore },
): void {
  const store = sessionStore(sessionId, options?.store);
  const loaded = store.load();
  if (!loaded) {
    return;
  }

  const next = applyFillOrderToActiveDraft({ ...loaded, store });
  next.store?.save(next);
}

export function replacePersistedCapturePhotos(
  sessionId: string | null,
  photos: CaptureSessionPhoto[],
  options?: {
    prefilledClub?: PrefilledClub | null;
    store?: CaptureSessionStore;
  },
): string {
  const nextSessionId = !sessionId
    ? persistCaptureSessionFromPhotos(photos, {
        prefilledClub: options?.prefilledClub,
        store: options?.store,
      })
    : (() => {
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
      })();

  const store = sessionStore(nextSessionId, options?.store);
  const loaded = store.load();
  if (loaded && photos.some((photo) => photo.role === null)) {
    const withRoles = applyFillOrderToActiveDraft({ ...loaded, store });
    withRoles.store?.save(withRoles);
  }

  return nextSessionId;
}

export function resolveResumableCameraSession(options?: {
  readSession?: (sessionId: string) => CaptureSessionState | null;
}): {
  sessionId: string;
  photoUris: string[];
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
  const photoUris = draft.photos.map((photo) => photo.uri);

  if (photoUris.length === 0) {
    clearActiveCameraCaptureSessionId();
    return null;
  }

  return { sessionId, photoUris };
}
