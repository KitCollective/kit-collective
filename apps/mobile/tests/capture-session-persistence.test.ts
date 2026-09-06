import { beforeEach, describe, expect, it } from "vitest";
import {
  createMemoryCaptureSessionStore,
  getActiveDraft,
  photoUriForRole,
} from "../src/capture/captureSession";
import {
  clearMemoryActiveCameraCaptureSessionIdForTests,
  getActiveCameraCaptureSessionId,
  setMemoryActiveCameraCaptureSessionIdForTests,
} from "../src/capture/captureSessionActivePointer";
import {
  finalizeShootFirstSession,
  persistCameraShotInSession,
  replacePersistedCapturePhotos,
  resolveResumableCameraSession,
} from "../src/capture/captureSessionPersistence";
import type { CaptureSessionStore } from "../src/capture/captureSessionTypes";

const URI_FRONT = "file:///photos/front.jpg";
const URI_BACK = "file:///photos/back.jpg";
const URI_LABEL = "file:///photos/label.jpg";

describe("captureSessionPersistence", () => {
  beforeEach(() => {
    clearMemoryActiveCameraCaptureSessionIdForTests();
  });

  it("persists the first camera shot unassigned in a new session", () => {
    const store = createMemoryCaptureSessionStore();
    const sessionId = persistCameraShotInSession(
      null,
      { uri: URI_FRONT, source: "camera" },
      { store, photoSource: "camera" },
    );

    const draft = getActiveDraft(store.load()!);
    expect(draft.photos).toEqual([{ uri: URI_FRONT, role: null, source: "camera" }]);
    expect(store.load()?.orderedUris).toEqual([URI_FRONT]);
    expect(getActiveCameraCaptureSessionId()).toBe(sessionId);
  });

  it("appends later camera shots unassigned to the same session", () => {
    const store = createMemoryCaptureSessionStore();
    const sessionId = persistCameraShotInSession(
      null,
      { uri: URI_FRONT, source: "camera" },
      { store, photoSource: "camera" },
    );

    persistCameraShotInSession(
      sessionId,
      { uri: URI_BACK, source: "camera" },
      { store, photoSource: "camera" },
    );

    const sessionState = store.load();
    expect(sessionState).toBeDefined();
    if (!sessionState) {
      throw new Error("expected session");
    }
    const draft = getActiveDraft(sessionState);
    expect(draft.photos).toEqual([
      { uri: URI_FRONT, role: null, source: "camera" },
      { uri: URI_BACK, role: null, source: "camera" },
    ]);
    expect(getActiveCameraCaptureSessionId()).toBe(sessionId);
  });

  it("recreates a session when append target is missing from storage", () => {
    const store = createMemoryCaptureSessionStore();
    const sessionId = persistCameraShotInSession(
      "missing-session-id",
      { uri: URI_FRONT, source: "camera" },
      { store, photoSource: "camera" },
    );

    expect(sessionId).not.toBe("missing-session-id");
    expect(store.load()?.orderedUris).toEqual([URI_FRONT]);
  });

  it("atomically replaces photos and applies fill order for unassigned shots", () => {
    const store = createMemoryCaptureSessionStore();
    const sessionId = persistCameraShotInSession(
      null,
      { uri: URI_FRONT, source: "camera" },
      { store, photoSource: "camera" },
    );

    replacePersistedCapturePhotos(
      sessionId,
      [
        { role: null, uri: URI_FRONT, source: "camera" },
        { role: null, uri: URI_BACK, source: "gallery" },
        { role: null, uri: URI_LABEL, source: "gallery" },
      ],
      { store },
    );

    const sessionState = store.load();
    expect(sessionState).toBeDefined();
    if (!sessionState) {
      throw new Error("expected session");
    }
    const draft = getActiveDraft(sessionState);
    expect(photoUriForRole(draft, "front")).toBe(URI_FRONT);
    expect(photoUriForRole(draft, "back")).toBe(URI_BACK);
    expect(photoUriForRole(draft, "left")).toBe(URI_LABEL);
    expect(sessionState.orderedUris).toEqual([URI_FRONT, URI_BACK, URI_LABEL]);
  });

  it("keeps the prior session when replace save fails", () => {
    const backingStore = createMemoryCaptureSessionStore();
    const sessionId = persistCameraShotInSession(
      null,
      { uri: URI_FRONT, source: "camera" },
      { store: backingStore, photoSource: "camera" },
    );

    const failingStore: CaptureSessionStore = {
      save() {
        throw new Error("simulated save failure");
      },
      load() {
        return backingStore.load();
      },
      clear() {
        backingStore.clear();
      },
    };

    expect(() =>
      replacePersistedCapturePhotos(
        sessionId,
        [
          { role: null, uri: URI_FRONT, source: "camera" },
          { role: null, uri: URI_BACK, source: "gallery" },
        ],
        { store: failingStore },
      ),
    ).toThrow("simulated save failure");

    expect(backingStore.load()?.orderedUris).toEqual([URI_FRONT]);
  });

  it("resolves an active in-progress session for camera resume", () => {
    const store = createMemoryCaptureSessionStore();
    const sessionId = persistCameraShotInSession(
      null,
      { uri: URI_FRONT, source: "camera" },
      { store, photoSource: "camera" },
    );

    setMemoryActiveCameraCaptureSessionIdForTests(sessionId);

    const resumed = resolveResumableCameraSession({
      readSession: (id) => (id === sessionId ? store.load() : null),
    });
    expect(resumed?.sessionId).toBe(sessionId);
    expect(resumed?.photoUris).toEqual([URI_FRONT]);
  });

  it("assigns fill order when finalizing a shoot-first session", () => {
    const store = createMemoryCaptureSessionStore();
    const sessionId = persistCameraShotInSession(
      null,
      { uri: URI_FRONT, source: "camera" },
      { store, photoSource: "camera" },
    );
    persistCameraShotInSession(
      sessionId,
      { uri: URI_BACK, source: "camera" },
      { store, photoSource: "camera" },
    );

    finalizeShootFirstSession(sessionId, { store });

    const draft = getActiveDraft(store.load()!);
    expect(photoUriForRole(draft, "front")).toBe(URI_FRONT);
    expect(photoUriForRole(draft, "back")).toBe(URI_BACK);
  });

  it("preserves per-photo source when replacing mixed camera and gallery shots", () => {
    const store = createMemoryCaptureSessionStore();

    replacePersistedCapturePhotos(
      null,
      [
        { role: null, uri: URI_FRONT, source: "camera" },
        { role: null, uri: URI_BACK, source: "gallery" },
      ],
      { store },
    );

    const draft = getActiveDraft(store.load()!);
    expect(draft.photos.find((photo) => photo.uri === URI_FRONT)?.source).toBe("camera");
    expect(draft.photos.find((photo) => photo.uri === URI_BACK)?.source).toBe("gallery");
  });
});
