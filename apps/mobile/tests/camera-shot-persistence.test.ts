import { describe, expect, it } from "vitest";
import {
  appendCameraShotToSession,
  createCaptureSession,
  createMemoryCaptureSessionStore,
  getActiveDraft,
  photoUriForRole,
  reloadCaptureSession,
} from "../src/capture/captureSession";

const URI_FRONT = "file:///photos/front.jpg";
const URI_BACK = "file:///photos/back.jpg";

describe("appendCameraShotToSession", () => {
  it("persists the first camera shot on a new session", () => {
    const store = createMemoryCaptureSessionStore();
    let session = createCaptureSession([], { store });
    session = appendCameraShotToSession(session, {
      role: "front",
      uri: URI_FRONT,
      source: "camera",
    });
    session.store?.save(session);

    const draft = getActiveDraft(session);
    expect(photoUriForRole(draft, "front")).toBe(URI_FRONT);
    expect(draft.photos[0]?.source).toBe("camera");
    expect(session.orderedUris).toEqual([URI_FRONT]);
    expect(reloadCaptureSession(store)?.orderedUris).toEqual([URI_FRONT]);
  });

  it("appends later camera shots to the same session", () => {
    const store = createMemoryCaptureSessionStore();
    let session = createCaptureSession([], { store });
    session = appendCameraShotToSession(session, {
      role: "front",
      uri: URI_FRONT,
      source: "camera",
    });
    session = appendCameraShotToSession(session, {
      role: "back",
      uri: URI_BACK,
      source: "camera",
    });

    const draft = getActiveDraft(session);
    expect(photoUriForRole(draft, "front")).toBe(URI_FRONT);
    expect(photoUriForRole(draft, "back")).toBe(URI_BACK);
    expect(session.orderedUris).toEqual([URI_FRONT, URI_BACK]);
    expect(draft.photos).toHaveLength(2);
  });
});
