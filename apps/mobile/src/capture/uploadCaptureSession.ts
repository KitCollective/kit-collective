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
 * `onSourceChosen` fires when the collector has chosen Photos or Files in the source
 * sheet, before that system picker answers.
 */
export async function runUploadCapture(
  adapter: UploadFilesAdapter,
  createSession: CreateUploadSession,
  options?: {
    prefilledClub?: PrefilledClub | null;
    onBuildStart?: () => void;
    onSourceChosen?: () => void;
  },
): Promise<UploadCaptureResult> {
  const uris = await pickUploadFiles(
    { allowsMultipleSelection: true, onSourceChosen: options?.onSourceChosen },
    adapter,
  );
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

/**
 * Why the scheduler called `run`: the loading screen is the presented top surface, or the
 * backstop gave up waiting for that.
 */
export type PresentedSignal = "presented" | "backstop";

/** What a running pick reports back while it is still open. */
export type UploadPickHooks = { onSourceChosen: () => void };

type UploadCapturePhase = "awaiting-presentation" | "picking" | "settled" | "cancelled";

export type StartUploadCaptureWhenPresentedDeps = {
  /**
   * Schedules `run` to fire only once the loading screen is the fully-presented,
   * top-most native surface. Production gates on the native-stack `transitionEnd` enter
   * event (with a reduced-motion frame-tick + a last-resort timeout backstop) — NOT
   * `InteractionManager.runAfterInteractions`, which clears when JS interaction handles
   * drain and does not wait for the native modal presentation, so the OS picker still
   * opened while Samling was the top VC. `run` may be invoked more than once (e.g. a
   * `transitionEnd` plus the backstop); only the first invocation opens the picker. A
   * call without a signal counts as "presented".
   */
  scheduleWhenPresented: (run: (signal?: PresentedSignal) => void) => PresentedTask;
  /** Opens the picker and, on a pick, builds the session (production: `runUploadCapture`). */
  runPick: (hooks: UploadPickHooks) => Promise<UploadCaptureResult>;
  /** Receives the settled result on the JS side (navigate to Confirm, or dismiss). */
  onResult: (result: UploadCaptureResult) => void;
  /**
   * Takes down a source sheet that may still be showing and says whether a new one may be
   * opened. Without it a pick is never opened twice.
   */
  dismissSourcePicker?: () => boolean;
};

/**
 * Orchestrates the Upload billeder branch *from the loading surface*: it never invokes
 * the picker inline. The picker only runs inside the presentation-gated callback, so the
 * order is always loading-screen-presented → picker-presented → result. Single-fire even
 * if the scheduler calls `run` several times, and returns a cleanup that cancels the
 * scheduled task and suppresses a late result after unmount.
 *
 * One exception to single-fire (KIT-345): when the backstop opened the source sheet and
 * the screen is only presented afterwards, iOS has taken that sheet down with the
 * transition without calling back, so its pick would never settle. The source sheet is
 * then opened once more and the first pick's result is ignored. Not once the collector
 * has chosen a source: the system picker is open then, and a second sheet would cover it.
 */
export function startUploadCaptureWhenPresented(
  deps: StartUploadCaptureWhenPresentedDeps,
): () => void {
  let phase: UploadCapturePhase = "awaiting-presentation";
  let attempt = 0;
  let openedByBackstop = false;
  let sourceChosen = false;

  const openPicker = () => {
    attempt += 1;
    const mine = attempt;
    sourceChosen = false;
    void deps
      .runPick({
        onSourceChosen: () => {
          if (mine === attempt) {
            sourceChosen = true;
          }
        },
      })
      .then((result) => {
        if (phase !== "picking" || mine !== attempt) {
          return;
        }
        phase = "settled";
        deps.onResult(result);
      });
  };

  const task = deps.scheduleWhenPresented((signal = "presented") => {
    if (phase === "awaiting-presentation") {
      phase = "picking";
      openedByBackstop = signal === "backstop";
      openPicker();
      return;
    }
    if (phase !== "picking" || !openedByBackstop || signal !== "presented" || sourceChosen) {
      return;
    }
    openedByBackstop = false;
    if (deps.dismissSourcePicker?.()) {
      openPicker();
    }
  });

  return () => {
    phase = "cancelled";
    task.cancel();
  };
}
