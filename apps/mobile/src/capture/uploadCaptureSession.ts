import type { PhotoSource } from "@kit/domain";
import type { PrefilledClub } from "./captureSessionPersistence";
import { pickUploadFiles, type UploadFilesAdapter } from "./pickUploadFiles";

/**
 * Result of the Upload billeder branch of the capture Chooser: either the collector
 * cancelled the system picker, or a persisted capture session was built and is ready
 * for Confirm. Pure so the (capture) loading route can be unit-tested without Expo.
 */
export type UploadCaptureResult =
  | { status: "cancelled" }
  | { status: "created"; sessionId: string };

/**
 * Injected session factory (production: `createPersistedCaptureSession`). Kept as a
 * dependency so this module never imports the SQLite-backed capture store, which lets
 * the loading route's logic run under vitest.
 */
export type CreateUploadSession = (
  orderedUris: string[],
  options: { prefilledClub: PrefilledClub | null; photoSource: PhotoSource },
) => { sessionId: string };

/**
 * Open the system picker (Photos / Files) and, once the collector confirms a pick,
 * build the persisted capture session. Returns `cancelled` when the picker is
 * dismissed with no selection so the caller can leave the loading route cleanly.
 *
 * `onBuildStart` fires only after a non-empty pick, right before the session is built,
 * so the loading surface can swap its caption from "opening picker" to "building".
 */
export async function runUploadCapture(
  adapter: UploadFilesAdapter,
  createSession: CreateUploadSession,
  options?: { prefilledClub?: PrefilledClub | null; onBuildStart?: () => void },
): Promise<UploadCaptureResult> {
  const uris = await pickUploadFiles({ allowsMultipleSelection: true }, adapter);
  if (!uris) {
    return { status: "cancelled" };
  }

  options?.onBuildStart?.();

  const { sessionId } = createSession(uris, {
    prefilledClub: options?.prefilledClub ?? null,
    photoSource: "gallery",
  });
  return { status: "created", sessionId };
}

/** Cancellable handle for the presentation-gated schedule. */
export type PresentedTask = { cancel: () => void };

type UploadCapturePhase = "awaiting-presentation" | "picking" | "settled" | "cancelled";

export type StartUploadCaptureWhenPresentedDeps = {
  /**
   * Schedules `run` to fire only once the loading screen is the fully-presented,
   * top-most native surface. Production gates on the native-stack `transitionEnd` enter
   * event (with a reduced-motion frame-tick + a last-resort timeout backstop) — NOT
   * `InteractionManager.runAfterInteractions`, which clears when JS interaction handles
   * drain and does not wait for the native modal presentation, so the OS picker still
   * opened while Samling was the top VC. `run` may be invoked more than once (e.g. a
   * `transitionEnd` plus the backstop); only the first invocation opens the picker.
   */
  scheduleWhenPresented: (run: () => void) => PresentedTask;
  /** Opens the picker and, on a pick, builds the session (production: `runUploadCapture`). */
  runPick: () => Promise<UploadCaptureResult>;
  /** Receives the settled result on the JS side (navigate to Confirm, or dismiss). */
  onResult: (result: UploadCaptureResult) => void;
};

/**
 * Orchestrates the Upload billeder branch *from the loading surface*: it never invokes
 * the picker inline. The picker only runs inside the presentation-gated callback, so the
 * order is always loading-screen-presented → picker-presented → result. Single-fire even
 * if the scheduler calls `run` several times, and returns a cleanup that cancels the
 * scheduled task and suppresses a late result after unmount.
 */
export function startUploadCaptureWhenPresented(
  deps: StartUploadCaptureWhenPresentedDeps,
): () => void {
  let phase: UploadCapturePhase = "awaiting-presentation";

  const task = deps.scheduleWhenPresented(() => {
    if (phase !== "awaiting-presentation") {
      return;
    }
    phase = "picking";
    void deps.runPick().then((result) => {
      if (phase !== "picking") {
        return;
      }
      phase = "settled";
      deps.onResult(result);
    });
  });

  return () => {
    phase = "cancelled";
    task.cancel();
  };
}
