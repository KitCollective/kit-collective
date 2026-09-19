import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  Keyframe,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { CaptureJerseyDraft } from "@/capture/captureSessionTypes";
import { useTypography } from "@/theme/brand-fonts";
import { motion, radius, space, type } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

type JerseyTabBarProps = {
  drafts: CaptureJerseyDraft[];
  activeDraftId: string;
  onSelectDraft: (draftId: string) => void;
  onAddJersey: () => void;
  analyzing?: boolean;
};

const TAB_SIZE = 44;
const BADGE_OUTSET = space.insetSm;
const LOCK_EASE = Easing.bezier(0.4, 0, 0.2, 1);
export const JERSEY_TAB_STEP = TAB_SIZE + space.gapSm;

export function jerseyTabPillX(index: number): number {
  return Math.max(0, index) * JERSEY_TAB_STEP;
}

function tabEntering() {
  return new Keyframe({
    0: {
      opacity: 0,
      transform: [{ scale: 0.95 }],
    },
    100: {
      opacity: 1,
      transform: [{ scale: 1 }],
      easing: LOCK_EASE,
    },
  }).duration(motion.slow);
}

function stripLayout() {
  return LinearTransition.duration(motion.slow).easing(LOCK_EASE);
}

export function JerseyTabBar({
  drafts,
  activeDraftId,
  onSelectDraft,
  onAddJersey,
  analyzing = false,
}: JerseyTabBarProps) {
  const theme = useTheme();
  const typography = useTypography();
  const reduceMotion = useReduceMotion();
  const selectedIndex = Math.max(
    0,
    drafts.findIndex((draft) => draft.id === activeDraftId),
  );
  const pillX = useSharedValue(jerseyTabPillX(selectedIndex));
  const pillMounted = useRef(false);
  const seenIdsRef = useRef<Set<string> | null>(null);
  if (seenIdsRef.current === null) {
    seenIdsRef.current = new Set(drafts.map((draft) => draft.id));
  }

  useEffect(() => {
    for (const draft of drafts) {
      seenIdsRef.current?.add(draft.id);
    }
  }, [drafts]);

  useEffect(() => {
    const nextX = jerseyTabPillX(selectedIndex);
    if (!pillMounted.current || reduceMotion) {
      pillMounted.current = true;
      pillX.set(nextX);
      return;
    }
    pillX.set(withTiming(nextX, { duration: motion.slow, easing: LOCK_EASE }));
  }, [pillX, reduceMotion, selectedIndex]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.get() }],
  }));
  const inverseStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -pillX.get() }],
  }));

  return (
    <View
      accessibilityRole="tablist"
      accessibilityState={analyzing ? { busy: true } : undefined}
      style={styles.container}
    >
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      >
        <View style={styles.tabTrack}>
          {drafts.map((draft, index) => {
            const selected = draft.id === activeDraftId;
            const photoCount = draft.photos.length;
            const jerseyNumber = index + 1;
            const isNew = !seenIdsRef.current!.has(draft.id);

            return (
              <Animated.View
                key={draft.id}
                entering={!reduceMotion && isNew ? tabEntering() : undefined}
                layout={reduceMotion ? undefined : stripLayout()}
                style={styles.tabWrap}
              >
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected, busy: analyzing }}
                  accessibilityLabel={`Trøje ${jerseyNumber}, ${photoCount} fotos`}
                  onPress={() => onSelectDraft(draft.id)}
                  style={({ pressed }) => [
                    styles.tab,
                    { backgroundColor: theme.fillSecondary },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[typography.label, { color: theme.contentPrimary }]}>
                    {jerseyNumber}
                  </Text>
                </Pressable>
                {photoCount > 0 ? (
                  <View
                    style={[
                      styles.countBadge,
                      {
                        backgroundColor: selected ? theme.surface : theme.fillPrimary,
                        borderColor: theme.canvas,
                      },
                    ]}
                    accessibilityElementsHidden
                  >
                    <Text
                      style={[
                        typography.captionSm,
                        {
                          color: selected ? theme.contentPrimary : theme.contentInverse,
                        },
                      ]}
                    >
                      {photoCount}
                    </Text>
                  </View>
                ) : null}
              </Animated.View>
            );
          })}

          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            style={[styles.pill, { backgroundColor: theme.fillPrimary }, pillStyle]}
          >
            <Animated.View style={[styles.inverseRow, inverseStyle]}>
              {drafts.map((draft, index) => (
                <View key={`inverse-${draft.id}`} style={styles.inverseCell}>
                  <Text style={[typography.label, { color: theme.contentInverse }]}>
                    {index + 1}
                  </Text>
                </View>
              ))}
            </Animated.View>
          </Animated.View>
        </View>

        <Animated.View
          key="add-jersey"
          layout={reduceMotion ? undefined : stripLayout()}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tilføj trøje"
            onPress={onAddJersey}
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: theme.fillSecondary },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="add"
              size={22}
              color={theme.contentPrimary}
              accessibilityElementsHidden
            />
          </Pressable>
        </Animated.View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: TAB_SIZE + BADGE_OUTSET,
  },
  strip: {
    gap: space.gapSm,
    alignItems: "center",
    paddingTop: BADGE_OUTSET,
    paddingRight: BADGE_OUTSET,
  },
  tabTrack: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm,
  },
  pill: {
    position: "absolute",
    top: 0,
    left: 0,
    width: TAB_SIZE,
    height: TAB_SIZE,
    borderRadius: radius.pill,
    overflow: "hidden",
    zIndex: 1,
  },
  inverseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm,
  },
  inverseCell: {
    width: TAB_SIZE,
    height: TAB_SIZE,
    justifyContent: "center",
    alignItems: "center",
  },
  tabWrap: {
    width: TAB_SIZE,
    height: TAB_SIZE,
  },
  addButton: {
    width: TAB_SIZE,
    height: TAB_SIZE,
    borderRadius: radius.pill,
    justifyContent: "center",
    alignItems: "center",
  },
  tab: {
    width: TAB_SIZE,
    height: TAB_SIZE,
    borderRadius: radius.pill,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  countBadge: {
    position: "absolute",
    top: -BADGE_OUTSET,
    right: -BADGE_OUTSET,
    minWidth: type.captionSm.lineHeight,
    height: type.captionSm.lineHeight,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
});
