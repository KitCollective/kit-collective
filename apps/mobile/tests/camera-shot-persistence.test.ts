import { describe, expect, it } from "vitest";
import {
  appendUnassignedCameraShotToSession,
  createCaptureSession,
  createMemoryCaptureSessionStore,
  getActiveDraft,
  photoUriForRole,
  reloadCaptureSession,
} from "../src/capture/captureSession";

const URI_FRONT = "file:///photos/front.jpg";
const URI_BACK = "file:///photos/back.jpg";

describe("appendUnassignedCameraShotToSession", () => {
  it("persists the first camera shot on a new session without a role", () => {
    const store = createMemoryCaptureSessionStore();
    let session = createCaptureSession([], { store });
    session = appendUnassignedCameraShotToSession(session, URI_FRONT, "camera");
    session.store?.save(session);

    const draft = getActiveDraft(session);
    expect(draft.photos).toEqual([
      expect.objectContaining({ uri: URI_FRONT, role: null, source: "camera" }),
    ]);
    expect(session.orderedUris).toEqual([URI_FRONT]);
    expect(reloadCaptureSession(store)?.orderedUris).toEqual([URI_FRONT]);
  });

  it("appends later camera shots to the same session without roles", () => {
    const store = createMemoryCaptureSessionStore();
    let session = createCaptureSession([], { store });
    session = appendUnassignedCameraShotToSession(session, URI_FRONT, "camera");
    session = appendUnassignedCameraShotToSession(session, URI_BACK, "camera");

    const draft = getActiveDraft(session);
    expect(draft.photos).toHaveLength(2);
    expect(draft.photos.every((photo) => photo.role === null)).toBe(true);
    expect(session.orderedUris).toEqual([URI_FRONT, URI_BACK]);
  });
});

describe("appendCameraShotToSession", () => {
  it("still supports explicit role assignment when needed", async () => {
    const { appendCameraShotToSession } = await import("../src/capture/captureSession");
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
