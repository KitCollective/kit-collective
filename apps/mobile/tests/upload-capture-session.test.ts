import { describe, expect, it, vi } from "vitest";
import type { UploadFilesAdapter } from "../src/capture/pickUploadFiles";
import {
  runUploadCapture,
  startUploadCaptureWhenPresented,
  type UploadCaptureResult,
} from "../src/capture/uploadCaptureSession";

function adapterReturning(uris: string[] | null): UploadFilesAdapter {
  return {
    os: "ios",
    showActionSheet(_request, callback) {
      // Pick "Fotos" (index 0) so the gallery branch runs.
      callback(0);
    },
    showAlert() {},
    async pickGalleryPhotos() {
      return uris;
    },
    async pickDocumentImages() {
      return uris;
    },
    galleryMultiSelectQuality: () => 0.8,
  };
}

describe("runUploadCapture", () => {
  it("builds a capture session after a successful pick", async () => {
    const createSession = vi.fn(() => ({ sessionId: "session-1" }));

    const result = await runUploadCapture(
      adapterReturning(["file:///gallery/front.jpg", "file:///gallery/back.jpg"]),
      createSession,
      { prefilledClub: { id: "club-1", label: "FCK" } },
    );

    expect(result).toEqual({ status: "created", sessionId: "session-1" });
    expect(createSession).toHaveBeenCalledWith(
      ["file:///gallery/front.jpg", "file:///gallery/back.jpg"],
      { prefilledClub: { id: "club-1", label: "FCK" }, photoSource: "gallery" },
    );
  });

  it("reports cancelled and never builds a session when the picker returns nothing", async () => {
    const createSession = vi.fn(() => ({ sessionId: "unused" }));

    const result = await runUploadCapture(adapterReturning(null), createSession);

    expect(result).toEqual({ status: "cancelled" });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("signals build start only after a real pick, so the caption swaps before the session builds", async () => {
    const order: string[] = [];
    const createSession = vi.fn(() => {
      order.push("build");
      return { sessionId: "session-2" };
    });

    await runUploadCapture(adapterReturning(["file:///gallery/front.jpg"]), createSession, {
      onBuildStart: () => order.push("build-start"),
    });

    expect(order).toEqual(["build-start", "build"]);
  });

  it("does not signal build start when the pick is cancelled", async () => {
    const onBuildStart = vi.fn();

    await runUploadCapture(adapterReturning(null), vi.fn(), { onBuildStart });

    expect(onBuildStart).not.toHaveBeenCalled();
  });
});

describe("startUploadCaptureWhenPresented", () => {
  // Holder objects avoid TS narrowing a `let x = null` (assigned only inside a callback)
  // to `never` at the call site.
  function presentHolder() {
    return { run: null as (() => void) | null };
  }

  it("does not invoke the picker until the presented signal fires", async () => {
    const present = presentHolder();
    const runPick = vi.fn(
      async (): Promise<UploadCaptureResult> => ({ status: "created", sessionId: "session-1" }),
    );
    const onResult = vi.fn();

    startUploadCaptureWhenPresented({
      scheduleWhenPresented: (run) => {
        present.run = run;
        return { cancel: () => {} };
      },
      runPick,
      onResult,
    });

    // The loading screen has entered but is not yet the presented top surface — idle.
    expect(runPick).not.toHaveBeenCalled();
    expect(present.run).not.toBeNull();

    // Simulate the native enter transition completing (transitionEnd).
    present.run?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(runPick).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith({ status: "created", sessionId: "session-1" });
  });

  it("opens the picker once even if the presented signal fires repeatedly (transitionEnd + backstop)", async () => {
    const present = presentHolder();
    const runPick = vi.fn(
      async (): Promise<UploadCaptureResult> => ({ status: "created", sessionId: "session-1" }),
    );

    startUploadCaptureWhenPresented({
      scheduleWhenPresented: (run) => {
        present.run = run;
        return { cancel: () => {} };
      },
      runPick,
      onResult: vi.fn(),
    });

    present.run?.();
    present.run?.();
    present.run?.();
    await Promise.resolve();

    expect(runPick).toHaveBeenCalledTimes(1);
  });

  it("never invokes the picker when cancelled before the signal (unmounted mid-transition)", async () => {
    const present = presentHolder();
    const runPick = vi.fn(async (): Promise<UploadCaptureResult> => ({ status: "cancelled" }));
    const cancel = vi.fn();

    const cleanup = startUploadCaptureWhenPresented({
      scheduleWhenPresented: (run) => {
        present.run = run;
        return { cancel };
      },
      runPick,
      onResult: vi.fn(),
    });

    cleanup();
    expect(cancel).toHaveBeenCalledTimes(1);

    // Even if the scheduler still fires the callback, the picker must stay closed.
    present.run?.();
    await Promise.resolve();

    expect(runPick).not.toHaveBeenCalled();
  });

  it("suppresses a late result that resolves after unmount", async () => {
    const present = presentHolder();
    const pick = { resolve: null as ((result: UploadCaptureResult) => void) | null };
    const onResult = vi.fn();

    const cleanup = startUploadCaptureWhenPresented({
      scheduleWhenPresented: (run) => {
        present.run = run;
        return { cancel: () => {} };
      },
      runPick: () =>
        new Promise<UploadCaptureResult>((resolve) => {
          pick.resolve = resolve;
        }),
      onResult,
    });

    present.run?.();
    await Promise.resolve();
    // Picker is open; the collector navigates away before it settles.
    cleanup();
    pick.resolve?.({ status: "created", sessionId: "late" });
    await Promise.resolve();

    expect(onResult).not.toHaveBeenCalled();
  });
});
