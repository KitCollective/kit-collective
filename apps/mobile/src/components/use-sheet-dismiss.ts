import { useCallback, useEffect, useMemo, useRef } from "react";
import { Dimensions } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { project, rubberband } from "@/components/gesture-physics";
import { motion } from "@/theme/tokens";

const FALLBACK_HEIGHT = Dimensions.get("window").height;
const DISMISS_FRACTION = 0.4;
const DRAG_ACTIVATE = 12;
/** Fail the vertical pan on horizontal intent so the door mode-swipe can win. */
const DRAG_FAIL_X = 16;

const SETTLE_SPRING = {
  duration: motion.base,
  dampingRatio: 0.8,
} as const;

const DISMISS_SPRING = {
  duration: motion.base,
  dampingRatio: 1,
  overshootClamping: true,
} as const;

type UseSheetDismissArgs = {
  visible: boolean;
  onDismiss: () => void;
  reduceMotion: boolean;
};

export function useSheetDismiss({ visible, onDismiss, reduceMotion }: UseSheetDismissArgs) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const dismiss = useCallback(() => {
    onDismissRef.current();
  }, []);

  const translateY = useSharedValue(reduceMotion ? 0 : FALLBACK_HEIGHT);
  const dragStart = useSharedValue(0);
  const sheetHeight = useSharedValue(FALLBACK_HEIGHT);
  const viewportHeight = useSharedValue(FALLBACK_HEIGHT);
  // Position of the inner ScrollView (0 = at top). Drives scroll-vs-dismiss handoff.
  const scrollOffset = useSharedValue(0);
  // True once the pan is actually pulling the sheet (vs. letting the list scroll).
  const driving = useSharedValue(false);

  const hideOffscreen = useCallback(() => {
    translateY.set(viewportHeight.get());
  }, [translateY, viewportHeight]);

  const present = useCallback(() => {
    if (reduceMotion) {
      translateY.set(0);
      return;
    }
    translateY.set(viewportHeight.get());
    translateY.set(withSpring(0, { duration: motion.base, dampingRatio: 1 }));
  }, [reduceMotion, translateY, viewportHeight]);

  useEffect(() => {
    if (!visible) {
      hideOffscreen();
      return;
    }
    present();
  }, [hideOffscreen, present, visible]);

  const requestDismiss = useCallback(() => {
    if (reduceMotion) {
      dismiss();
      return;
    }
    translateY.set(
      withSpring(viewportHeight.get(), DISMISS_SPRING, (finished) => {
        if (finished) {
          runOnJS(dismiss)();
        }
      }),
    );
  }, [dismiss, reduceMotion, translateY, viewportHeight]);

  // A no-op native gesture the inner ScrollView (if any) wears so a downward drag can be
  // handled simultaneously by the pan — the pan only takes over once the list is at top.
  const scrollGesture = useMemo(() => Gesture.Native(), []);

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollOffset.set(event.contentOffset.y);
  });

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!reduceMotion)
        .maxPointers(1)
        .activeOffsetY([-DRAG_ACTIVATE, DRAG_ACTIVATE])
        .failOffsetX([-DRAG_FAIL_X, DRAG_FAIL_X])
        .simultaneousWithExternalGesture(scrollGesture)
        .onStart(() => {
          driving.set(false);
        })
        .onUpdate((event) => {
          const height = sheetHeight.get();
          if (!driving.get()) {
            // Hand the gesture to the inner list while it can still scroll up, or on an
            // upward pull. Only a downward drag from the very top pulls the sheet.
            if (scrollOffset.get() > 0 || event.translationY <= 0) {
              return;
            }
            driving.set(true);
            dragStart.set(event.translationY);
          }
          const next = event.translationY - dragStart.get();
          translateY.set(next >= 0 ? next : rubberband(next, height));
        })
        .onEnd((event) => {
          if (!driving.get()) {
            return;
          }
          driving.set(false);
          const height = sheetHeight.get();
          const projected = translateY.get() + project(event.velocityY);
          if (projected > height * DISMISS_FRACTION) {
            translateY.set(
              withSpring(
                viewportHeight.get(),
                { ...DISMISS_SPRING, velocity: event.velocityY },
                (finished) => {
                  if (finished) {
                    runOnJS(dismiss)();
                  }
                },
              ),
            );
            return;
          }
          translateY.set(withSpring(0, { ...SETTLE_SPRING, velocity: event.velocityY }));
        }),
    [dismiss, dragStart, driving, reduceMotion, scrollGesture, scrollOffset, sheetHeight, translateY, viewportHeight],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.get() }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.get(),
      [0, Math.max(sheetHeight.get(), 1)],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const onSheetLayout = useCallback(
    (height: number) => {
      if (height > 0) {
        sheetHeight.set(height);
      }
    },
    [sheetHeight],
  );

  const onViewportLayout = useCallback(
    (height: number) => {
      if (height > 0) {
        viewportHeight.set(height);
      }
    },
    [viewportHeight],
  );

  return {
    pan,
    scrollGesture,
    scrollHandler,
    sheetStyle,
    backdropStyle,
    requestDismiss,
    onSheetLayout,
    onViewportLayout,
  };
}
