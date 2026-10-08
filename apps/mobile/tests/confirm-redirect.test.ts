import { describe, expect, it } from "vitest";
import {
  createCaptureSession,
  createMemoryCaptureSessionStore,
  getActiveDraft,
} from "../src/capture/captureSession";
import { shouldConfirmRedirectAway } from "../src/capture/confirmRedirect";

const URI_FRONT = "file:///photos/front.jpg";

describe("shouldConfirmRedirectAway", () => {
  it("does not redirect before the session lookup has resolved", () => {
    expect(shouldConfirmRedirectAway("session-1", null, false)).toBe(false);
  });

  it("redirects when resolved and the session is missing", () => {
    expect(shouldConfirmRedirectAway("session-1", null, true)).toBe(true);
  });

  it("redirects when resolved and sessionId is missing", () => {
    expect(shouldConfirmRedirectAway(undefined, null, true)).toBe(true);
  });

  it("stays on Confirm when a persisted session exists", () => {
    const store = createMemoryCaptureSessionStore();
    const session = createCaptureSession([URI_FRONT], {
      store,
      sessionId: "session-1",
      photoSource: "gallery",
    });

    expect(shouldConfirmRedirectAway("session-1", session, true)).toBe(false);
  });
});

describe("synchronous persisted session load", () => {
  it("reads a stored session on first render before redirect logic runs", () => {
    const store = createMemoryCaptureSessionStore();
    createCaptureSession([URI_FRONT], {
      store,
      sessionId: "session-1",
      photoSource: "gallery",
    });

    const loaded = store.load();
    expect(loaded).not.toBeNull();
    if (!loaded) {
      throw new Error("expected session");
    }
    expect(getActiveDraft(loaded).photos[0]?.uri).toBe(URI_FRONT);
    expect(shouldConfirmRedirectAway("session-1", loaded, true)).toBe(false);
  });
});
