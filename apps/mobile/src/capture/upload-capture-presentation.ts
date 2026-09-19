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
 * top-most native surface. Reduced motion has no transition event, so it uses two
 * frames; animated presentation uses transitionEnd with a pathological-event backstop.
 */
export function scheduleUploadWhenPresented(
  navigation: TransitionNavigation,
  reduceMotion: boolean,
  run: () => void,
): PresentedTask {
  if (reduceMotion) {
    let innerFrame = 0;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(run);
    });
    return {
      cancel: () => {
        cancelAnimationFrame(outerFrame);
        cancelAnimationFrame(innerFrame);
      },
    };
  }

  const unsubscribe = navigation.addListener("transitionEnd", (event) => {
    if (!event.data?.closing) {
      run();
    }
  });
  const backstop = setTimeout(run, PRESENT_BACKSTOP_MS);

  return {
    cancel: () => {
      unsubscribe();
      clearTimeout(backstop);
    },
  };
}
