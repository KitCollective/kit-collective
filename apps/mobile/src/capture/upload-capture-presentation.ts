import type { PresentedTask } from "./uploadCaptureSession";

const PRESENT_BACKSTOP_MS = 1_200;

export type TransitionNavigation = {
  addListener: (
    type: "transitionEnd",
    callback: (event: { data?: { closing?: boolean } }) => void,
  ) => () => void;
};

/**
 * Schedules the upload picker after the loading route has painted and become the
 * top-most native surface. Animated presentation ends with transitionEnd. With
 * Reduce Motion the route enters without a transition and there is no such event,
 * so once the setting is known to be on, two frames stand in for it. The setting
 * is read here, asynchronously: a value captured at mount is always "off". The
 * backstop covers a missing event and a setting that never answers. `run` may be
 * called more than once; the caller fires it once.
 */
export function scheduleUploadWhenPresented(
  navigation: TransitionNavigation,
  readReduceMotion: () => Promise<boolean>,
  run: () => void,
): PresentedTask {
  let cancelled = false;
  let outerFrame = 0;
  let innerFrame = 0;

  const unsubscribe = navigation.addListener("transitionEnd", (event) => {
    if (!event.data?.closing) {
      run();
    }
  });
  const backstop = setTimeout(run, PRESENT_BACKSTOP_MS);
  void readReduceMotion().then((reduceMotion) => {
    if (cancelled || !reduceMotion) {
      return;
    }
    outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(run);
    });
  });

  return {
    cancel: () => {
      cancelled = true;
      unsubscribe();
      clearTimeout(backstop);
      cancelAnimationFrame(outerFrame);
      cancelAnimationFrame(innerFrame);
    },
  };
}
