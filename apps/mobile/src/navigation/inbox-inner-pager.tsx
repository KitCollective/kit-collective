import { type ReactNode, useCallback, useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { rubberband } from "@/components/gesture-physics";
import { motion } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";
import {
  INBOX_TABS,
  inboxOuterPanShouldActivate,
  inboxTabAtIndex,
  inboxTabIndex,
  PLACE_PAN_ACTIVE_X,
  PLACE_PAN_FAIL_Y,
  placePagerSnapIndex,
} from "./place-swipe";
import { usePlaceSwipe } from "./place-swipe-context";

type InboxInnerPagerProps = {
  enabled: boolean;
  pageWidth: number;
  header: ReactNode;
  messages: ReactNode;
  activity: ReactNode;
};

const SNAP_SPRING = {
  duration: motion.base,
  dampingRatio: 1,
  overshootClamping: true,
} as const;

/**
 * Beskeder | Aktivitet as a Reanimated row. A nested PagerView never fails at
 * the edge, so the outer place-pan cannot take over (stuck in Indbakke). This
 * pan fails when `inboxOuterPanShouldActivate` is true; the parent pan then
 * continues to Samling or Søg.
 */
export function InboxInnerPager({
  enabled,
  pageWidth,
  header,
  messages,
  activity,
}: InboxInnerPagerProps) {
  const theme = useTheme();
  const { inboxTab, setInboxTab, inboxInnerTabIndex, setInboxInnerPan } = usePlaceSwipe();
  const translateX = useSharedValue(-inboxTabIndex(inboxTab) * pageWidth);
  const dragStartX = useSharedValue(-inboxTabIndex(inboxTab) * pageWidth);
  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);
  const pageWidthSv = useSharedValue(pageWidth);

  const commitInner = useCallback(
    (nextIndex: number) => {
      const tab = inboxTabAtIndex(nextIndex);
      if (tab) {
        setInboxTab(tab);
      }
    },
    [setInboxTab],
  );

  useEffect(() => {
    pageWidthSv.set(pageWidth);
    const target = -inboxTabIndex(inboxTab) * pageWidth;
    if (Math.abs(translateX.get() - target) < 1) {
      return;
    }
    translateX.set(enabled ? withSpring(target, SNAP_SPRING) : target);
  }, [enabled, inboxTab, pageWidth, pageWidthSv, translateX]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
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
          if (inboxOuterPanShouldActivate(true, inboxInnerTabIndex.get(), dx, true)) {
            state.fail();
            return;
          }
          state.activate();
        })
        .onBegin(() => {
          dragStartX.set(translateX.get());
        })
        .onUpdate((event) => {
          const width = pageWidthSv.get();
          const min = -(INBOX_TABS.length - 1) * width;
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
          const width = pageWidthSv.get();
          const startIndex = Math.round(-dragStartX.get() / width);
          const nextIndex = placePagerSnapIndex(
            translateX.get(),
            event.velocityX,
            width,
            INBOX_TABS.length,
            startIndex,
          );
          inboxInnerTabIndex.set(nextIndex);
          translateX.set(
            withSpring(-nextIndex * width, { ...SNAP_SPRING, velocity: event.velocityX }),
          );
          if (nextIndex !== startIndex) {
            scheduleOnRN(commitInner, nextIndex);
          }
        }),
    [
      commitInner,
      dragStartX,
      enabled,
      inboxInnerTabIndex,
      pageWidthSv,
      touchStartX,
      touchStartY,
      translateX,
    ],
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }
    setInboxInnerPan(pan);
    return () => setInboxInnerPan(null);
  }, [enabled, pan, setInboxInnerPan]);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.get() }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.column, { backgroundColor: theme.canvas }]}>
        {header}
        <Animated.View style={[styles.viewport, { backgroundColor: theme.canvas }]}>
          <Animated.View
            style={[
              styles.row,
              { width: pageWidth * INBOX_TABS.length, backgroundColor: theme.canvas },
              rowStyle,
            ]}
          >
            <View collapsable={false} style={[styles.page, { width: pageWidth }]}>
              {messages}
            </View>
            <View collapsable={false} style={[styles.page, { width: pageWidth }]}>
              {activity}
            </View>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  column: {
    flex: 1,
  },
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
    height: "100%",
  },
});
