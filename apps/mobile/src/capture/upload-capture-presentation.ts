import type { PresentedSignal, PresentedTask } from "./uploadCaptureSession";

const PRESENT_BACKSTOP_MS = 1_200;
/** Total wait for the end of a transition that was seen to start. */
const TRANSITION_BACKSTOP_MS = 10_000;

export type TransitionNavigation = {
  addListener: (
    type: "transitionStart" | "transitionEnd",
    callback: (event: { data?: { closing?: boolean } }) => void,
  ) => () => void;
};

/**
 * Schedules the upload picker after the loading route has painted and become the
 * top-most native surface. Animated presentation ends with transitionEnd. With
 * Reduce Motion the route may enter without a transition and without that event,
 * so once the setting is known to be on, two frames stand in for it. The setting
 * is read here, asynchronously: a value captured at mount is always "off". The
 * backstop covers a missing event and a setting that never answers.
 *
 * Only transitionEnd reports "presented". The frames and the backstops are guesses and
 * report "backstop", so a transitionEnd that still comes lets the caller recover: with
 * Reduce Motion on, the simulator still animated the route in, the frames opened the
 * sheet 0.9 s after the tap, and iOS took it down when the route appeared (KIT-345).
 *
 * Neither guess fires into a transition that is known to be running: iOS
 * takes a sheet presented mid-transition down when the transition ends and calls
 * nothing back, which left the collector on the loading screen (KIT-345). A
 * transition that started gets the long backstop instead. The start event can be
 * missed (it may fire before this subscribes), so `run` is told which signal
 * fired and is still called with "presented" after a "backstop": the caller opens
 * the picker once and uses the later signal to recover.
 */
export function scheduleUploadWhenPresented(
  navigation: TransitionNavigation,
  readReduceMotion: () => Promise<boolean>,
  run: (signal: PresentedSignal) => void,
): PresentedTask {
  let cancelled = false;
  let transitioning = false;
  let outerFrame = 0;
  let innerFrame = 0;
  let longBackstop: ReturnType<typeof setTimeout> | undefined;

  const unsubscribeStart = navigation.addListener("transitionStart", (event) => {
    if (!event.data?.closing) {
      transitioning = true;
    }
  });
  const unsubscribeEnd = navigation.addListener("transitionEnd", (event) => {
    if (!event.data?.closing) {
      transitioning = false;
      run("presented");
    }
  });
  const backstop = setTimeout(() => {
    if (!transitioning) {
      run("backstop");
      return;
    }
    longBackstop = setTimeout(() => run("backstop"), TRANSITION_BACKSTOP_MS - PRESENT_BACKSTOP_MS);
  }, PRESENT_BACKSTOP_MS);
  void readReduceMotion().then((reduceMotion) => {
    if (cancelled || !reduceMotion) {
      return;
    }
    outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        if (!transitioning) {
          run("backstop");
        }
      });
    });
  });

  return {
    cancel: () => {
      cancelled = true;
      unsubscribeStart();
      unsubscribeEnd();
      clearTimeout(backstop);
      clearTimeout(longBackstop);
      cancelAnimationFrame(outerFrame);
      cancelAnimationFrame(innerFrame);
    },
  };
}
