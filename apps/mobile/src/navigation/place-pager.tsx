import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { rubberband } from "@/components/gesture-physics";
import { motion } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";
import { PlaceHome } from "./place-homes";
import {
  inboxOuterPanShouldActivate,
  PLACE_HREFS,
  PLACE_ORDER,
  PLACE_PAN_ACTIVE_X,
  PLACE_PAN_FAIL_Y,
  type PlaceId,
  placeAtIndex,
  placeIndex,
  placePagerHoldUntilAfterBlur,
  placePagerSnapIndex,
} from "./place-swipe";
import { usePlaceSwipe } from "./place-swipe-context";

type PlacePagerProps = {
  hostedPlace: PlaceId;
  focused: boolean;
};

const SNAP_SPRING = {
  duration: motion.base,
  dampingRatio: 1,
  overshootClamping: true,
} as const;

/**
 * One finger-followed row per place tab. Not PagerView: v8 hosts a SwiftUI
 * UICollectionView that only `setupView`s in `didMoveToWindow`, so NativeTabs
 * attach remounts the pager and iOS applies automatic content insets (hop
 * down, then back). A Reanimated row is already in Yoga before the tab
 * attaches.
 *
 * All five homes stay mounted: rebuilding the row snaps it to the host page.
 * On blur the row stays on the swiped page until `PLACE_PAGER_HOLD_AFTER_BLUR_MS`,
 * then parks on the host page off-screen.
 */
export function PlacePager({ hostedPlace, focused }: PlacePagerProps) {
  const router = useRouter();
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const hostedIndex = placeIndex(hostedPlace);
  const { inboxInnerTabIndex, inboxInnerConsumesSwipe, inboxInnerPan } = usePlaceSwipe();
  const holdUntilRef = useRef<number | null>(null);
  const pageWidth = useSharedValue(windowWidth);
  const translateX = useSharedValue(-hostedIndex * windowWidth);
  const dragStartX = useSharedValue(-hostedIndex * windowWidth);
  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);
  const isInboxHost = hostedPlace === "inbox";

  const now = Date.now();
  holdUntilRef.current = placePagerHoldUntilAfterBlur(focused, holdUntilRef.current, now);

  const commitPlace = useCallback(
    (nextIndex: number) => {
      const nextPlace = placeAtIndex(nextIndex);
      if (!nextPlace || nextPlace === hostedPlace) {
        return;
      }
      router.navigate(PLACE_HREFS[nextPlace]);
    },
    [hostedPlace, router],
  );

  useEffect(() => {
    pageWidth.set(windowWidth);
    if (focused) {
      translateX.set(-hostedIndex * windowWidth);
    }
  }, [focused, hostedIndex, pageWidth, translateX, windowWidth]);

  useEffect(() => {
    if (focused) {
      return;
    }
    const delay = Math.max(0, (holdUntilRef.current ?? 0) - Date.now());
    const timer = setTimeout(() => {
      translateX.set(-hostedIndex * pageWidth.get());
    }, delay);
    return () => clearTimeout(timer);
  }, [focused, hostedIndex, pageWidth, translateX]);

  const pan = useMemo(() => {
    const gesture = Gesture.Pan()
      .enabled(focused)
      .manualActivation(true)
      .onTouchesDown((event) => {
        const touch = event.allTouches[0];
        touchStartX.set(touch?.absoluteX ?? 0);
        touchStartY.set(touch?.absoluteY ?? 0);
      })
      .onTouchesMove((event, state) => {
        const touch = event.allTouches[0];
        if (!touch) {
          return;
        }
        const dx = touch.absoluteX - touchStartX.get();
        const dy = touch.absoluteY - touchStartY.get();
        if (Math.abs(dx) < PLACE_PAN_ACTIVE_X && Math.abs(dy) < PLACE_PAN_FAIL_Y) {
          return;
        }
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > PLACE_PAN_FAIL_Y) {
          state.fail();
          return;
        }
        if (Math.abs(dx) < PLACE_PAN_ACTIVE_X) {
          return;
        }
        if (
          !inboxOuterPanShouldActivate(
            isInboxHost,
            inboxInnerTabIndex.get(),
            dx,
            inboxInnerConsumesSwipe.get(),
          )
        ) {
          state.fail();
          return;
        }
        state.activate();
      })
      .onBegin(() => {
        dragStartX.set(translateX.get());
      })
      .onUpdate((event) => {
        const width = pageWidth.get();
        const min = -(PLACE_ORDER.length - 1) * width;
        const next = dragStartX.get() + event.translationX;
        if (next > 0) {
          translateX.set(rubberband(next, width));
          return;
        }
        if (next < min) {
          translateX.set(min + rubberband(next - min, width));
          return;
        }
        translateX.set(next);
      })
      .onEnd((event) => {
        const width = pageWidth.get();
        const startIndex = Math.round(-dragStartX.get() / width);
        const nextIndex = placePagerSnapIndex(
          translateX.get(),
          event.velocityX,
          width,
          PLACE_ORDER.length,
          startIndex,
        );
        if (nextIndex === startIndex) {
          translateX.set(withSpring(-startIndex * width, SNAP_SPRING));
          return;
        }
        translateX.set(
          withSpring(
            -nextIndex * width,
            { ...SNAP_SPRING, velocity: event.velocityX },
            (finished) => {
              if (finished) {
                scheduleOnRN(commitPlace, nextIndex);
              }
            },
          ),
        );
      });
    if (isInboxHost && inboxInnerPan) {
      return gesture.requireExternalGestureToFail(inboxInnerPan);
    }
    return gesture;
  }, [
    commitPlace,
    dragStartX,
    focused,
    inboxInnerConsumesSwipe,
    inboxInnerPan,
    inboxInnerTabIndex,
    isInboxHost,
    pageWidth,
    touchStartX,
    touchStartY,
    translateX,
  ]);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.get() }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.viewport, { backgroundColor: theme.canvas }]}>
        <Animated.View
          style={[
            styles.row,
            { width: windowWidth * PLACE_ORDER.length, backgroundColor: theme.canvas },
            rowStyle,
          ]}
        >
          {PLACE_ORDER.map((place) => (
            <View
              key={place}
              collapsable={false}
              style={[styles.page, { width: windowWidth, backgroundColor: theme.canvas }]}
            >
              <PlaceHome place={place} />
            </View>
          ))}
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    overflow: "hidden",
  },
  row: {
    flex: 1,
    flexDirection: "row",
  },
  page: {
    flexGrow: 0,
    flexShrink: 0,
  },
});
