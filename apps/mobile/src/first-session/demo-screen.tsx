import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BRAND_MOMENTS } from "@/first-session/brand-moments";
import {
  DEMO_MEASURED_SECONDS,
  DEMO_ROW_KEYS,
  type DemoRowKey,
  demoResolvedRows,
  demoRowValue,
  demoSecondsLabel,
  demoTimeline,
  type ExampleJersey,
} from "@/first-session/demo";
import { OnDarkButton } from "@/first-session/on-dark-button";
import type { DemoExampleId } from "@/first-session/session";
import { examplePhoto } from "@/first-session/wall-photos";
import {
  DEMO_ANOTHER_LABEL,
  DEMO_EXAMPLE_MARK,
  DEMO_ROW_LABELS,
  DEMO_START_LABEL,
} from "@/first-session/welcome-copy";
import type { ExampleOrigins, TileRect } from "@/first-session/welcome-screen";
import { useTypography } from "@/theme/brand-fonts";
import { color, motion, radius, space, withAlpha } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";

const STAGE_WIDTH_RATIO = 0.56;
const STAGE_RATIO = 5 / 4;
const MUTED_ALPHA = 0.64;
const SKELETON_ALPHA = 0.16;
const RING_SCALE = 1.08;
const SCAN_LINE_HEIGHT = 2;
const LOCK_EASE = Easing.bezier(0.4, 0, 0.2, 1);

type DemoScreenProps = {
  example: ExampleJersey;
  /** Where the example tiles sat on the welcome screen; null when unknown. */
  origins: ExampleOrigins | null;
  /** Opens the door. The demo itself never signs anyone in or calls the network. */
  onStart: () => void;
  onTryAnother: () => void;
};

type StageRect = { x: number; y: number; width: number; height: number };

function travelFrom(origin: TileRect | undefined, stage: StageRect) {
  if (!origin) {
    return { dx: 0, dy: stage.height * 0.5, scale: 0.4 };
  }
  return {
    dx: origin.x + origin.width / 2 - (stage.x + stage.width / 2),
    dy: origin.y + origin.height / 2 - (stage.y + stage.height / 2),
    scale: origin.width / stage.width,
  };
}

/**
 * Try-it demo: the tapped jersey travels to a 4:5 stage, Vision is shown at
 * work, then club, season and type resolve one row at a time. A fixed local
 * result: no Vision call, no network. Brand moments: Jersey to stage and
 * Vision at work (docs/design-system.md -> Motion).
 */
export function DemoScreen({ example, origins, onStart, onTryAnother }: DemoScreenProps) {
  const typography = useTypography();
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const timeline = demoTimeline(reduceMotion);
  const stageWidth = Math.round(width * STAGE_WIDTH_RATIO);
  const stage: StageRect = {
    x: (width - stageWidth) / 2,
    y: insets.top + space.insetLg,
    width: stageWidth,
    height: stageWidth * STAGE_RATIO,
  };
  const mutedColor = withAlpha(color.contentInverse, MUTED_ALPHA);

  const [resolved, setResolved] = useState<DemoRowKey[]>([]);
  const [resultReady, setResultReady] = useState(false);

  const travel = useSharedValue(0);
  const scanY = useSharedValue(0);
  const scanOpacity = useSharedValue(0);
  const ring = useSharedValue(0);
  const resultOpacity = useSharedValue(0);

  // The timeline depends only on reduceMotion and the stage on window size, so the
  // run restarts only when the example or the motion setting changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    setResolved([]);
    setResultReady(false);
    resultOpacity.set(0);
    travel.set(0);
    ring.set(0);
    scanOpacity.set(0);

    if (timeline.travel === "fly") {
      // Scaled transform with a small overshoot; layout never animates.
      travel.set(withSpring(1, { duration: timeline.travelMs, dampingRatio: 0.7 }));
    } else {
      travel.set(withTiming(1, { duration: timeline.travelMs, easing: LOCK_EASE }));
    }

    if (timeline.showsScanLine) {
      scanY.set(0);
      scanOpacity.set(withDelay(timeline.travelMs, withTiming(1, { duration: motion.fast })));
      scanY.set(
        withDelay(
          timeline.travelMs,
          withRepeat(
            withTiming(stage.height, {
              duration: BRAND_MOMENTS.visionAtWork.scanPassMs,
              easing: Easing.linear,
            }),
            -1,
          ),
        ),
      );
      // One ring pulse on the crest when the club resolves.
      ring.set(
        withDelay(timeline.rowAtMs[0], withTiming(1, { duration: motion.slow, easing: LOCK_EASE })),
      );
    }

    DEMO_ROW_KEYS.forEach((_, index) => {
      timers.push(
        setTimeout(() => {
          setResolved(demoResolvedRows(timeline, timeline.rowAtMs[index] ?? 0));
        }, timeline.rowAtMs[index]),
      );
    });
    timers.push(
      setTimeout(() => {
        scanOpacity.set(withTiming(0, { duration: motion.fast }));
        cancelAnimation(scanY);
        setResultReady(true);
        resultOpacity.set(withTiming(1, { duration: motion.base, easing: LOCK_EASE }));
      }, timeline.resultAtMs),
    );

    return () => {
      timers.forEach(clearTimeout);
      cancelAnimation(travel);
      cancelAnimation(scanY);
    };
  }, [example.id, reduceMotion]);

  const from = travelFrom(origins?.[example.id], stage);
  const stageStyle = useAnimatedStyle(() => {
    const p = travel.get();
    if (timeline.travel === "crossfade") {
      return { opacity: p };
    }
    return {
      opacity: 1,
      transform: [
        { translateX: from.dx * (1 - p) },
        { translateY: from.dy * (1 - p) },
        { scale: from.scale + (1 - from.scale) * p },
      ],
    };
  });
  const scanStyle = useAnimatedStyle(() => ({
    opacity: scanOpacity.get(),
    transform: [{ translateY: scanY.get() }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1 - ring.get()) * (ring.get() > 0 ? 0.64 : 0),
    transform: [{ scale: 1 + (RING_SCALE - 1) * ring.get() }],
  }));
  const resultStyle = useAnimatedStyle(() => ({ opacity: resultOpacity.get() }));
  const secondsLabel = demoSecondsLabel(DEMO_MEASURED_SECONDS);

  return (
    <View style={[styles.screen, { backgroundColor: color.fillPrimary }]}>
      <GhostTiles
        origins={origins}
        activeId={example.id}
        travel={travel}
        reduceMotion={reduceMotion}
      />
      <Animated.View
        style={[
          styles.stage,
          { left: stage.x, top: stage.y, width: stage.width, height: stage.height },
          stageStyle,
        ]}
      >
        <Image
          source={examplePhoto(example.id)}
          resizeMode="cover"
          accessibilityLabel={`${example.clubLabel} ${example.seasonLabel}`}
          style={styles.stageImage}
        />
        {timeline.showsScanLine ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.scanLine,
              { backgroundColor: withAlpha(color.contentInverse, 0.8) },
              scanStyle,
            ]}
          />
        ) : null}
        {timeline.showsScanLine ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.ring, { borderColor: color.contentInverse }, ringStyle]}
          />
        ) : null}
      </Animated.View>

      <View
        style={[styles.rows, { top: stage.y + stage.height + space.insetLg }]}
        accessibilityLiveRegion="polite"
      >
        {DEMO_ROW_KEYS.map((row) => (
          <DemoRow
            key={row}
            label={DEMO_ROW_LABELS[row]}
            value={demoRowValue(example, row)}
            revealed={resolved.includes(row)}
            revealMs={timeline.rowRevealMs}
            mutedColor={mutedColor}
          />
        ))}
        <Animated.View style={[styles.resultMeta, resultStyle]}>
          <View style={[styles.mark, { borderColor: mutedColor }]}>
            <Text style={[typography.mono, { color: color.contentInverse }]}>
              {DEMO_EXAMPLE_MARK}
            </Text>
          </View>
          {secondsLabel ? (
            <Text style={[typography.mono, { color: mutedColor }]}>{secondsLabel}</Text>
          ) : null}
        </Animated.View>
      </View>

      <View
        style={[styles.dock, { paddingBottom: Math.max(insets.bottom, space.insetMd) }]}
        pointerEvents={resultReady ? "auto" : "none"}
      >
        <Animated.View style={[styles.dockStack, resultStyle]}>
          <OnDarkButton label={DEMO_START_LABEL} variant="primary" onPress={onStart} />
          <OnDarkButton label={DEMO_ANOTHER_LABEL} variant="tertiary" onPress={onTryAnother} />
        </Animated.View>
      </View>
    </View>
  );
}

type GhostTilesProps = {
  origins: ExampleOrigins | null;
  activeId: DemoExampleId;
  travel: SharedValue<number>;
  reduceMotion: boolean;
};

/** The other examples sink and fade while the chosen tile travels (Brand moments). */
function GhostTiles({ origins, activeId, travel, reduceMotion }: GhostTilesProps) {
  const style = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(travel.get(), 1),
    transform: [{ translateY: Math.min(travel.get(), 1) * space.insetLg }],
  }));

  if (!origins || reduceMotion) {
    return null;
  }

  return (
    <>
      {(Object.keys(origins) as DemoExampleId[])
        .filter((id) => id !== activeId)
        .map((id) => {
          const rect = origins[id];
          return (
            <Animated.View
              key={id}
              pointerEvents="none"
              style={[
                styles.ghost,
                { left: rect.x, top: rect.y, width: rect.width, height: rect.height },
                style,
              ]}
            >
              <Image source={examplePhoto(id)} resizeMode="cover" style={styles.stageImage} />
            </Animated.View>
          );
        })}
    </>
  );
}

type DemoRowProps = {
  label: string;
  value: string;
  revealed: boolean;
  revealMs: number;
  mutedColor: string;
};

function DemoRow({ label, value, revealed, revealMs, mutedColor }: DemoRowProps) {
  const typography = useTypography();
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.set(withTiming(revealed ? 1 : 0, { duration: revealMs, easing: LOCK_EASE }));
  }, [opacity, revealMs, revealed]);

  const valueStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const skeletonStyle = useAnimatedStyle(() => ({ opacity: 1 - opacity.get() }));

  return (
    <View style={styles.row}>
      <Text style={[typography.mono, { color: mutedColor }]}>{label}</Text>
      <View style={styles.rowValue}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.skeleton,
            { backgroundColor: withAlpha(color.contentInverse, SKELETON_ALPHA) },
            skeletonStyle,
          ]}
        />
        <Animated.Text style={[typography.title, { color: color.contentInverse }, valueStyle]}>
          {value}
        </Animated.Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  stage: {
    position: "absolute",
    borderRadius: radius.md,
    overflow: "visible",
  },
  stageImage: {
    width: "100%",
    height: "100%",
    borderRadius: radius.md,
  },
  ghost: {
    position: "absolute",
    borderRadius: radius.md,
    overflow: "hidden",
  },
  scanLine: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: SCAN_LINE_HEIGHT,
  },
  ring: {
    ...StyleSheet.absoluteFill,
    borderWidth: 2,
    borderRadius: radius.md,
  },
  rows: {
    position: "absolute",
    left: space.insetLg,
    right: space.insetLg,
    gap: space.gapMd,
  },
  row: {
    gap: space.gapSm / 2,
  },
  rowValue: {
    minHeight: 29,
    justifyContent: "center",
  },
  skeleton: {
    position: "absolute",
    left: 0,
    width: "40%",
    height: 16,
    borderRadius: radius.sm,
  },
  resultMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
  },
  mark: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: space.insetMd,
    paddingVertical: space.insetSm / 2,
  },
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.insetLg,
  },
  dockStack: {
    gap: space.gapMd,
  },
});
