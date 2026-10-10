import { useEffect, useRef } from "react";
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BRAND_MOMENTS } from "@/first-session/brand-moments";
import { EXAMPLE_JERSEYS } from "@/first-session/demo";
import { JerseyWall } from "@/first-session/jersey-wall";
import { motionGate } from "@/first-session/motion-gate";
import { OnDarkButton } from "@/first-session/on-dark-button";
import type { DemoExampleId } from "@/first-session/session";
import { examplePhoto } from "@/first-session/wall-photos";
import {
  exampleTileLabel,
  WELCOME_EXAMPLES_CAPTION,
  WELCOME_HAVE_ACCOUNT_LABEL,
  WELCOME_HEADLINE,
  WELCOME_OWN_PHOTO_LABEL,
} from "@/first-session/welcome-copy";
import { useTypography } from "@/theme/brand-fonts";
import { color, radius, space, withAlpha } from "@/theme/tokens";
import { useReduceMotionSetting } from "@/theme/use-reduce-motion";
import LockupWhite from "../../assets/brand/kitcollective-lockup-white.svg";

const LOCKUP_WIDTH = 132;
const LOCKUP_HEIGHT = LOCKUP_WIDTH * (480 / 2592);
const MUTED_ALPHA = 0.64;
const LOCK_EASE = Easing.bezier(0.4, 0, 0.2, 1);

export type TileRect = { x: number; y: number; width: number; height: number };
export type ExampleOrigins = Record<DemoExampleId, TileRect>;

type WelcomeScreenProps = {
  /** Called at once on tap, with where each example tile sits so the demo can travel from it. */
  onStartDemo: (exampleId: DemoExampleId, origins: ExampleOrigins) => void;
  onOwnPhoto: () => void;
  onHaveAccount: () => void;
};

/** Copy and actions rise in once, 520ms with a 90ms stagger (Brand moments). */
function useRise(index: number, reduceMotion: boolean) {
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      progress.set(1);
      return;
    }
    progress.set(0);
    progress.set(
      withDelay(
        index * BRAND_MOMENTS.wall.riseStaggerMs,
        withTiming(1, { duration: BRAND_MOMENTS.wall.riseMs, easing: LOCK_EASE }),
      ),
    );
  }, [index, progress, reduceMotion]);

  return useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: (1 - progress.get()) * space.insetLg }],
  }));
}

/** A tap must never hang on a view that does not answer, so measuring gives up after this. */
const MEASURE_TIMEOUT_MS = 300;

function measure(view: View | null): Promise<TileRect | null> {
  return new Promise((resolve) => {
    if (!view) {
      resolve(null);
      return;
    }
    const giveUp = setTimeout(() => resolve(null), MEASURE_TIMEOUT_MS);
    view.measureInWindow((x, y, width, height) => {
      clearTimeout(giveUp);
      resolve({ x, y, width, height });
    });
  });
}

// The first-session screens deliberately use the static dark plate colors in both appearances.
export function WelcomeScreen(props: WelcomeScreenProps) {
  const gate = motionGate(useReduceMotionSetting());

  if (!gate.ready) {
    return <View style={[styles.screen, { backgroundColor: color.fillPrimary }]} />;
  }
  return <WelcomeBody {...props} reduceMotion={gate.reduceMotion} />;
}

function WelcomeBody({
  onStartDemo,
  onOwnPhoto,
  onHaveAccount,
  reduceMotion,
}: WelcomeScreenProps & { reduceMotion: boolean }) {
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tileRefs = useRef<Partial<Record<DemoExampleId, View | null>>>({});
  const tileWidth = (width - space.insetLg * 2 - space.gapMd * 2) / 3;
  const mutedColor = withAlpha(color.contentInverse, MUTED_ALPHA);

  const lockupRise = useRise(0, reduceMotion);
  const headlineRise = useRise(1, reduceMotion);
  const examplesRise = useRise(2, reduceMotion);
  const actionsRise = useRise(3, reduceMotion);

  async function handleExample(exampleId: DemoExampleId) {
    const rects = await Promise.all(
      EXAMPLE_JERSEYS.map((jersey) => measure(tileRefs.current[jersey.id] ?? null)),
    );
    // SAFETY: the keys come from EXAMPLE_JERSEYS, whose ids are exactly DemoExampleId.
    const origins = Object.fromEntries(
      EXAMPLE_JERSEYS.map((jersey, index) => [
        jersey.id,
        rects[index] ?? { x: space.insetLg, y: 0, width: tileWidth, height: tileWidth * 1.25 },
      ]),
    ) as ExampleOrigins;
    onStartDemo(exampleId, origins);
  }

  return (
    <View style={[styles.screen, { backgroundColor: color.fillPrimary }]}>
      <JerseyWall reduceMotion={reduceMotion} />
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + space.insetMd,
            paddingBottom: Math.max(insets.bottom, space.insetMd),
          },
        ]}
        pointerEvents="box-none"
      >
        <Animated.View style={lockupRise}>
          <LockupWhite
            width={LOCKUP_WIDTH}
            height={LOCKUP_HEIGHT}
            accessibilityLabel="KitCollective"
          />
        </Animated.View>
        <View style={styles.spacer} pointerEvents="none" />
        <Animated.View style={headlineRise}>
          <Text
            accessibilityRole="header"
            style={[typography.display, { color: color.contentInverse }]}
          >
            {WELCOME_HEADLINE}
          </Text>
        </Animated.View>
        <Animated.View style={[styles.examples, examplesRise]}>
          <Text style={[typography.mono, { color: mutedColor }]}>{WELCOME_EXAMPLES_CAPTION}</Text>
          <View style={styles.tileRow}>
            {EXAMPLE_JERSEYS.map((jersey) => (
              <Pressable
                key={jersey.id}
                ref={(node) => {
                  tileRefs.current[jersey.id] = node;
                }}
                collapsable={false}
                testID={`welcome-example-${jersey.id}`}
                accessibilityRole="button"
                accessibilityLabel={exampleTileLabel(jersey.clubLabel, jersey.seasonLabel)}
                onPress={() => {
                  void handleExample(jersey.id);
                }}
                style={({ pressed }) => [
                  styles.tile,
                  { width: tileWidth, height: tileWidth * 1.25 },
                  pressed && styles.pressed,
                ]}
              >
                <Image
                  source={examplePhoto(jersey.id)}
                  resizeMode="cover"
                  style={styles.tileImage}
                />
              </Pressable>
            ))}
          </View>
        </Animated.View>
        <Animated.View style={[styles.actions, actionsRise]}>
          <OnDarkButton
            label={WELCOME_OWN_PHOTO_LABEL}
            testID="welcome-own-photo"
            variant="secondary"
            onPress={onOwnPhoto}
          />
          <OnDarkButton
            label={WELCOME_HAVE_ACCOUNT_LABEL}
            testID="welcome-have-account"
            variant="tertiary"
            onPress={onHaveAccount}
          />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: space.insetLg,
    gap: space.gapLg,
  },
  spacer: {
    flex: 1,
  },
  examples: {
    gap: space.gapMd,
  },
  tileRow: {
    flexDirection: "row",
    gap: space.gapMd,
  },
  tile: {
    borderRadius: radius.md,
    overflow: "hidden",
  },
  tileImage: {
    width: "100%",
    height: "100%",
  },
  actions: {
    gap: space.gapMd,
    alignSelf: "stretch",
  },
  pressed: {
    opacity: 0.9,
  },
});
