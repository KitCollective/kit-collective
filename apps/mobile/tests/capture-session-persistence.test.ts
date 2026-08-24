import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/drafts/db", () => {
  const rows = new Map<string, string>();
  return {
    draftDb: {
      execSync: () => {},
      runSync: (_sql: string, params?: unknown[]) => {
        if (params?.[0] === "capture_camera_active_session" && params[1]) {
          rows.set("capture_camera_active_session", String(params[1]));
        }
      },
      getFirstSync: (_sql: string, params?: unknown[]) => {
        if (params?.[0] === "capture_camera_active_session") {
          const value = rows.get("capture_camera_active_session");
          return value ? { value } : null;
        }
        return null;
      },
      getAllSync: () => [],
    },
  };
});

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

  it("persists the first camera shot in a new session", () => {
    const store = createMemoryCaptureSessionStore();
    const sessionId = persistCameraShotInSession(
      null,
      { role: "front", uri: URI_FRONT, source: "camera" },
      { store, photoSource: "camera" },
    );

    expect(store.load()?.orderedUris).toEqual([URI_FRONT]);
    expect(getActiveCameraCaptureSessionId()).toBe(sessionId);
  });

  it("appends later camera shots to the same session", () => {
    const store = createMemoryCaptureSessionStore();
    const sessionId = persistCameraShotInSession(
      null,
      { role: "front", uri: URI_FRONT, source: "camera" },
      { store, photoSource: "camera" },
    );

    persistCameraShotInSession(
      sessionId,
      { role: "back", uri: URI_BACK, source: "camera" },
      { store, photoSource: "camera" },
    );

    const sessionState = store.load();
    expect(sessionState).toBeDefined();
    if (!sessionState) {
      throw new Error("expected session");
    }
    const draft = getActiveDraft(sessionState);
    expect(photoUriForRole(draft, "front")).toBe(URI_FRONT);
    expect(photoUriForRole(draft, "back")).toBe(URI_BACK);
    expect(getActiveCameraCaptureSessionId()).toBe(sessionId);
  });

  it("recreates a session when append target is missing from storage", () => {
    const store = createMemoryCaptureSessionStore();
    const sessionId = persistCameraShotInSession(
      "missing-session-id",
      { role: "front", uri: URI_FRONT, source: "camera" },
      { store, photoSource: "camera" },
    );

    expect(sessionId).not.toBe("missing-session-id");
    expect(store.load()?.orderedUris).toEqual([URI_FRONT]);
  });

  it("atomically replaces photos without a separate clear step", () => {
    const store = createMemoryCaptureSessionStore();
    const sessionId = persistCameraShotInSession(
      null,
      { role: "front", uri: URI_FRONT, source: "camera" },
      { store, photoSource: "camera" },
    );

    replacePersistedCapturePhotos(
      sessionId,
      [
        { role: "front", uri: URI_FRONT, source: "camera" },
        { role: "back", uri: URI_BACK, source: "gallery" },
        { role: "label", uri: URI_LABEL, source: "gallery" },
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
    expect(photoUriForRole(draft, "label")).toBe(URI_LABEL);
    expect(sessionState?.orderedUris).toEqual([URI_FRONT, URI_BACK, URI_LABEL]);
  });

  it("keeps the prior session when replace save fails", () => {
    const backingStore = createMemoryCaptureSessionStore();
    const sessionId = persistCameraShotInSession(
      null,
      { role: "front", uri: URI_FRONT, source: "camera" },
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
          { role: "front", uri: URI_FRONT, source: "camera" },
          { role: "back", uri: URI_BACK, source: "gallery" },
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
      { role: "front", uri: URI_FRONT, source: "camera" },
      { store, photoSource: "camera" },
    );

    setMemoryActiveCameraCaptureSessionIdForTests(sessionId);

    const resumed = resolveResumableCameraSession({
      readSession: (id) => (id === sessionId ? store.load() : null),
    });
    expect(resumed?.sessionId).toBe(sessionId);
    expect(resumed?.photos).toEqual([{ role: "front", uri: URI_FRONT }]);
  });
});
