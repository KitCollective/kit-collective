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

describe("runUploadCapture source hook", () => {
  it("reports the chosen source before the system picker answers, and not on a cancelled sheet", async () => {
    const order: string[] = [];
    const adapter: UploadFilesAdapter = {
      ...adapterReturning(["file:///gallery/front.jpg"]),
      async pickGalleryPhotos() {
        order.push("system-picker");
        return ["file:///gallery/front.jpg"];
      },
    };
    await runUploadCapture(adapter, () => ({ sessionId: "s" }), {
      onSourceChosen: () => order.push("source-chosen"),
    });
    expect(order).toEqual(["source-chosen", "system-picker"]);

    const onSourceChosen = vi.fn();
    const cancelled: UploadFilesAdapter = {
      ...adapterReturning(null),
      showActionSheet(_request, callback) {
        callback(2);
      },
    };
    await runUploadCapture(cancelled, () => ({ sessionId: "s" }), { onSourceChosen });
    expect(onSourceChosen).not.toHaveBeenCalled();
  });
});

describe("startUploadCaptureWhenPresented", () => {
  // Holder objects avoid TS narrowing a `let x = null` (assigned only inside a callback)
  // to `never` at the call site.
  function presentHolder(): { run: (() => void) | null } {
    return { run: null };
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
    const pick: { resolve: ((result: UploadCaptureResult) => void) | null } = { resolve: null };
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
  // KIT-345: the backstop opened the source sheet while the loading route was still animating
  // in. iOS takes such a sheet down when the transition ends and calls nothing back, so the
  // first pick never settles and the collector is left on the loading screen.
  describe("a picker opened before the screen finished presenting", () => {
    type Signal = "presented" | "backstop";
    type Hooks = { onSourceChosen: () => void };

    function harness(options: { dismissSourcePicker?: () => boolean } = {}) {
      const present: { run: ((signal?: Signal) => void) | null } = { run: null };
      const picks: Array<{ hooks: Hooks; resolve: (result: UploadCaptureResult) => void }> = [];
      const onResult = vi.fn();
      const cleanup = startUploadCaptureWhenPresented({
        scheduleWhenPresented: (run) => {
          present.run = run;
          return { cancel: () => {} };
        },
        runPick: (hooks) =>
          new Promise<UploadCaptureResult>((resolve) => {
            picks.push({ hooks, resolve });
          }),
        onResult,
        ...options,
      });
      return { present, picks, onResult, cleanup };
    }

    it("opens the source picker again once the screen is presented, and takes that pick's result", async () => {
      const dismissSourcePicker = vi.fn(() => true);
      const { present, picks, onResult } = harness({ dismissSourcePicker });

      present.run?.("backstop");
      expect(picks).toHaveLength(1);
      present.run?.("presented");
      expect(dismissSourcePicker).toHaveBeenCalledTimes(1);
      expect(picks).toHaveLength(2);

      picks[1]?.resolve({ status: "created", sessionId: "second" });
      await Promise.resolve();
      expect(onResult).toHaveBeenCalledWith({ status: "created", sessionId: "second" });
    });

    it("ignores the abandoned first pick if it settles after all", async () => {
      const { present, picks, onResult } = harness({ dismissSourcePicker: () => true });
      present.run?.("backstop");
      present.run?.("presented");

      picks[0]?.resolve({ status: "cancelled" });
      await Promise.resolve();
      expect(onResult).not.toHaveBeenCalled();

      picks[1]?.resolve({ status: "created", sessionId: "second" });
      await Promise.resolve();
      expect(onResult).toHaveBeenCalledTimes(1);
      expect(onResult).toHaveBeenCalledWith({ status: "created", sessionId: "second" });
    });

    it("opens it again only once, however often the presented signal repeats", () => {
      const { present, picks } = harness({ dismissSourcePicker: () => true });
      present.run?.("backstop");
      present.run?.("presented");
      present.run?.("presented");
      present.run?.("backstop");
      expect(picks).toHaveLength(2);
    });

    it("leaves the pick alone once the collector has chosen a source: the system picker is open", () => {
      const dismissSourcePicker = vi.fn(() => true);
      const { present, picks } = harness({ dismissSourcePicker });
      present.run?.("backstop");
      picks[0]?.hooks.onSourceChosen();
      present.run?.("presented");
      expect(dismissSourcePicker).not.toHaveBeenCalled();
      expect(picks).toHaveLength(1);
    });

    it("leaves the pick alone when the first sheet cannot be taken down (no dismiss, or it says no)", () => {
      const without = harness();
      without.present.run?.("backstop");
      without.present.run?.("presented");
      expect(without.picks).toHaveLength(1);

      const refused = harness({ dismissSourcePicker: () => false });
      refused.present.run?.("backstop");
      refused.present.run?.("presented");
      expect(refused.picks).toHaveLength(1);
    });

    it("does nothing extra when the screen was presented first", () => {
      const dismissSourcePicker = vi.fn(() => true);
      const { present, picks } = harness({ dismissSourcePicker });
      present.run?.("presented");
      present.run?.("backstop");
      present.run?.("presented");
      expect(dismissSourcePicker).not.toHaveBeenCalled();
      expect(picks).toHaveLength(1);
    });

    it("does not open anything again after unmount", () => {
      const { present, picks, cleanup } = harness({ dismissSourcePicker: () => true });
      present.run?.("backstop");
      cleanup();
      present.run?.("presented");
      expect(picks).toHaveLength(1);
    });
  });
});
