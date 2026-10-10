import { PHOTO_ROLES } from "@kit/domain";
import { useEffect, useMemo, useRef, useState } from "react";
import { Image, StyleSheet, useWindowDimensions, View } from "react-native";
import {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchUnsignedVisionJob, startUnsignedVisionSuggest } from "@/api/vision";
import { loadPersistedCaptureSession } from "@/capture/captureFlow";
import { getActiveDraft, photoUriForRole } from "@/capture/captureSession";
import { buildIdentitySuggestRequest } from "@/capture/identitySuggestRequest";
import {
  ANALYSING_CAPTION,
  ANALYSING_FILL_SELF_LABEL,
  ANALYSING_TITLE,
} from "@/first-session/analysing-copy";
import { BRAND_MOMENTS } from "@/first-session/brand-moments";
import { DEMO_ROW_KEYS, type DemoRowKey } from "@/first-session/demo";
import { motionGate } from "@/first-session/motion-gate";
import { OnDarkButton } from "@/first-session/on-dark-button";
import {
  classifyVisionJob,
  type VisionRows,
  visionResolvedRows,
  visionReveal,
} from "@/first-session/vision-result";
import {
  LOCK_EASE,
  MUTED_ALPHA,
  StageOverlays,
  stageRectFor,
  VisionRow,
  visionStageStyles,
} from "@/first-session/vision-stage";
import { DEMO_ROW_LABELS } from "@/first-session/welcome-copy";
import { color, motion, space, withAlpha } from "@/theme/tokens";
import { useReduceMotionSetting } from "@/theme/use-reduce-motion";

const VISION_TIMEOUT_MS = 12_000;
const VISION_POLL_MS = 2_000;
const RING_SCALE = 1.08;

type FirstSessionAnalysingScreenProps = {
  captureSessionId: string;
  onVisionComplete: () => void;
  onVisionFailed: () => void;
  onFillSelf: () => void;
};

/**
 * Own-photo road: the collector's photo on the 4:5 stage, Vision at work (scan
 * line, one ring pulse), then club, season and type resolve one row at a time.
 * Real unsigned Vision, no seconds counter until a time is measured. The door
 * opens over the finished result. On a dark plate in both appearances, like the
 * demo.
 */
export function FirstSessionAnalysingScreen(props: FirstSessionAnalysingScreenProps) {
  const gate = motionGate(useReduceMotionSetting());

  if (!gate.ready) {
    return <View style={[styles.screen, { backgroundColor: color.fillPrimary }]} />;
  }
  return <AnalysingBody {...props} reduceMotion={gate.reduceMotion} />;
}

function AnalysingBody({
  captureSessionId,
  onVisionComplete,
  onVisionFailed,
  onFillSelf,
  reduceMotion,
}: FirstSessionAnalysingScreenProps & { reduceMotion: boolean }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const stage = stageRectFor(width, insets.top + space.insetLg);
  const mutedColor = withAlpha(color.contentInverse, MUTED_ALPHA);

  const [rows, setRows] = useState<VisionRows>({});
  const [resolved, setResolved] = useState<DemoRowKey[]>([]);

  const scanY = useSharedValue(0);
  const scanOpacity = useSharedValue(0);
  const ring = useSharedValue(0);

  // Latest handlers, so a host re-render never restarts the Vision run.
  const handlers = useRef({ onVisionComplete, onVisionFailed });
  handlers.current = { onVisionComplete, onVisionFailed };
  const settledRef = useRef(false);

  const draft = useMemo(() => {
    const state = loadPersistedCaptureSession(captureSessionId);
    return state ? getActiveDraft(state) : null;
  }, [captureSessionId]);

  const stagePhotoUri = useMemo(() => {
    if (!draft) {
      return null;
    }
    for (const role of PHOTO_ROLES) {
      const uri = photoUriForRole(draft, role);
      if (uri) {
        return uri;
      }
    }
    return null;
  }, [draft]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: shared values are stable; the run depends on the draft and the motion setting only
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;
    let jobId: string | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    const startedAt = Date.now();

    const settle = (outcome: "complete" | "failed") => {
      if (settledRef.current || cancelled) {
        return;
      }
      settledRef.current = true;
      if (interval) {
        clearInterval(interval);
      }
      scanOpacity.set(withTiming(0, { duration: motion.fast }));
      cancelAnimation(scanY);
      if (outcome === "complete") {
        handlers.current.onVisionComplete();
      } else {
        handlers.current.onVisionFailed();
      }
    };

    if (!draft || draft.photos.length === 0) {
      settle("failed");
      return;
    }

    if (!reduceMotion) {
      scanOpacity.set(withTiming(1, { duration: motion.fast }));
      scanY.set(0);
      scanY.set(
        withRepeat(
          withTiming(stage.height, {
            duration: BRAND_MOMENTS.visionAtWork.scanPassMs,
            easing: Easing.linear,
          }),
          -1,
        ),
      );
    }

    const showResult = (found: VisionRows) => {
      if (settledRef.current) {
        return;
      }
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      setRows(found);
      const reveal = visionReveal(found);
      DEMO_ROW_KEYS.forEach((key) => {
        const at = reveal.rowAtMs[key];
        if (at === undefined) {
          return;
        }
        timers.push(setTimeout(() => setResolved(visionResolvedRows(reveal, at)), at));
      });
      if (!reduceMotion) {
        const firstAt = DEMO_ROW_KEYS.map((key) => reveal.rowAtMs[key]).find(
          (at) => at !== undefined,
        );
        ring.set(
          withDelay(firstAt ?? 0, withTiming(1, { duration: motion.slow, easing: LOCK_EASE })),
        );
      }
      // The door opens once the last row has resolved.
      timers.push(setTimeout(() => settle("complete"), reveal.doneAtMs));
    };

    const poll = async () => {
      if (cancelled || settledRef.current || !jobId) {
        return;
      }
      if (Date.now() - startedAt >= VISION_TIMEOUT_MS) {
        settle("failed");
        return;
      }
      try {
        const outcome = classifyVisionJob(await fetchUnsignedVisionJob(jobId));
        if (cancelled || settledRef.current) {
          return;
        }
        if (outcome.kind === "ready") {
          showResult(outcome.rows);
        } else if (outcome.kind === "failed") {
          settle("failed");
        }
      } catch {
        settle("failed");
      }
    };

    void (async () => {
      try {
        const payload = await buildIdentitySuggestRequest(draft);
        jobId = await startUnsignedVisionSuggest(payload);
      } catch {
        // Includes the anonymous cap (HTTP 429): the failure screen says so.
        settle("failed");
        return;
      }
      if (cancelled) {
        return;
      }
      interval = setInterval(() => {
        void poll();
      }, VISION_POLL_MS);
      void poll();
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      if (interval) {
        clearInterval(interval);
      }
      cancelAnimation(scanY);
    };
  }, [draft, reduceMotion]);

  const scanStyle = useAnimatedStyle(() => ({
    opacity: scanOpacity.get(),
    transform: [{ translateY: scanY.get() }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1 - ring.get()) * (ring.get() > 0 ? 0.64 : 0),
    transform: [{ scale: 1 + (RING_SCALE - 1) * ring.get() }],
  }));

  return (
    <View style={[styles.screen, { backgroundColor: color.fillPrimary }]}>
      <View
        testID="analysing-stage"
        accessibilityLabel={`${ANALYSING_TITLE}. ${ANALYSING_CAPTION}`}
        style={[
          visionStageStyles.stage,
          { left: stage.x, top: stage.y, width: stage.width, height: stage.height },
        ]}
      >
        {stagePhotoUri ? (
          <Image
            source={{ uri: stagePhotoUri }}
            resizeMode="cover"
            style={visionStageStyles.stageImage}
          />
        ) : null}
        <StageOverlays showsScanLine={!reduceMotion} scanStyle={scanStyle} ringStyle={ringStyle} />
      </View>

      <View
        style={[visionStageStyles.rows, { top: stage.y + stage.height + space.insetLg }]}
        accessibilityLiveRegion="polite"
      >
        {DEMO_ROW_KEYS.map((row) => (
          <VisionRow
            key={row}
            label={DEMO_ROW_LABELS[row]}
            value={rows[row]}
            revealed={resolved.includes(row)}
            revealMs={BRAND_MOMENTS.visionAtWork.rowRevealMs}
            mutedColor={mutedColor}
          />
        ))}
      </View>

      {/* Motion never blocks input: Udfyld selv works from the first frame. */}
      <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, space.insetMd) }]}>
        <OnDarkButton
          label={ANALYSING_FILL_SELF_LABEL}
          testID="analysing-fill-self"
          variant="tertiary"
          onPress={onFillSelf}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.insetLg,
  },
});
