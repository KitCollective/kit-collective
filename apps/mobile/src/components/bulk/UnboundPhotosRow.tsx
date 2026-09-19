import { Ionicons } from "@expo/vector-icons";
import { useEffect, type ComponentProps } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeOut,
  LinearTransition,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import {
  SANDBOX_GATHER_LIFT,
  sandboxGatherDelayMs,
  sandboxGatherTranslateX,
} from "@/capture/sandboxGather";
import { ConfirmAnalyzingPulse } from "@/components/confirm-analyzing-pulse";
import { useTypography } from "@/theme/brand-fonts";
import { motion, radius, space, withAlpha } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

const THUMB_WIDTH = space.insetLg * 3;
const THUMB_HEIGHT = (THUMB_WIDTH * 5) / 4;
const LOCK_EASE = Easing.bezier(0.4, 0, 0.2, 1);
const GATHER_FADE_DELAY_MS = Math.round(motion.slow * 0.7);
const GATHER_FADE_MS = motion.base;

type UnboundPhotosRowProps = {
  uris: string[];
  activeTabLabel: string;
  onPressPhoto: (uri: string) => void;
  onDiscardPhoto: (uri: string) => void;
  onUpload: () => void;
  analyzing?: boolean;
  gatheringUris?: string[];
};

type UnboundPhotoThumbProps = {
  uri: string;
  index: number;
  total: number;
  activeTabLabel: string;
  analyzing: boolean;
  gathering: boolean;
  gatherTranslateX: number;
  gatherDelayMs: number;
  gatherZIndex: number;
  reduceMotion: boolean;
  layout?: ComponentProps<typeof Animated.View>["layout"];
  exiting?: ComponentProps<typeof Animated.View>["exiting"];
  onPressPhoto: (uri: string) => void;
  onDiscardPhoto: (uri: string) => void;
};

function UnboundPhotoThumb({
  uri,
  index,
  total,
  activeTabLabel,
  analyzing,
  gathering,
  gatherTranslateX,
  gatherDelayMs,
  gatherZIndex,
  reduceMotion,
  layout,
  exiting,
  onPressPhoto,
  onDiscardPhoto,
}: UnboundPhotoThumbProps) {
  const theme = useTheme();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      translateX.set(0);
      translateY.set(0);
      scale.set(1);
      opacity.set(1);
      return;
    }

    if (!gathering) {
      cancelAnimation(translateX);
      cancelAnimation(translateY);
      cancelAnimation(scale);
      cancelAnimation(opacity);
      translateX.set(0);
      translateY.set(0);
      scale.set(1);
      opacity.set(1);
      return;
    }

    const timing = { duration: motion.slow, easing: LOCK_EASE };
    translateX.set(withDelay(gatherDelayMs, withTiming(gatherTranslateX, timing)));
    translateY.set(withDelay(gatherDelayMs, withTiming(-SANDBOX_GATHER_LIFT, timing)));
    scale.set(withDelay(gatherDelayMs, withTiming(0.95, timing)));
    opacity.set(
      withDelay(
        gatherDelayMs + GATHER_FADE_DELAY_MS,
        withTiming(0, { duration: GATHER_FADE_MS, easing: LOCK_EASE }),
      ),
    );
  }, [gatherDelayMs, gatherTranslateX, gathering, opacity, reduceMotion, scale, translateX, translateY]);

  const gatherStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.get() },
      { translateY: translateY.get() },
      { scale: scale.get() },
    ],
    opacity: opacity.get(),
  }));

  return (
    <Animated.View
      style={[styles.thumbWrap, gathering && styles.thumbWrapGathering, { zIndex: gatherZIndex }]}
      exiting={gathering ? undefined : exiting}
      layout={gathering ? undefined : layout}
    >
      <Animated.View style={gatherStyle}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Uredigeret foto ${index + 1} af ${total}`}
          accessibilityHint={
            gathering
              ? `Samler fotoet til ${activeTabLabel}.`
              : analyzing
                ? `Grupperer fotoet. Tilføjer det til ${activeTabLabel}.`
                : `Tilføjer fotoet til ${activeTabLabel}.`
          }
          onPress={() => onPressPhoto(uri)}
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          <Image
            source={{ uri }}
            style={[
              styles.thumb,
              {
                backgroundColor: theme.fillSecondary,
                borderColor: theme.borderSubtle,
              },
            ]}
            accessibilityIgnoresInvertColors
          />
        </Pressable>
        {analyzing && !gathering ? (
          <ConfirmAnalyzingPulse
            color={withAlpha(theme.canvas, 0.6)}
            style={styles.thumbPulse}
          />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Fjern foto ${index + 1} fra sandkassen`}
          onPress={() => onDiscardPhoto(uri)}
          style={({ pressed }) => [styles.discardHit, pressed && styles.pressed]}
        >
          <View style={[styles.discardBadge, { backgroundColor: theme.surface }]}>
            <Ionicons
              name="close-circle"
              size={22}
              color={theme.danger}
              accessibilityElementsHidden
            />
          </View>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

export function UnboundPhotosRow({
  uris,
  activeTabLabel,
  onPressPhoto,
  onDiscardPhoto,
  onUpload,
  analyzing = false,
  gatheringUris = [],
}: UnboundPhotosRowProps) {
  const theme = useTheme();
  const typography = useTypography();
  const reduceMotion = useReduceMotion();
  const layout = reduceMotion
    ? undefined
    : LinearTransition.duration(motion.slow).easing(LOCK_EASE);
  const exiting = reduceMotion ? undefined : FadeOut.duration(motion.slow).easing(LOCK_EASE);

  return (
    <Animated.ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      accessibilityRole="list"
      accessibilityLabel={`Uredigerede fotos, ${uris.length} stk.`}
      accessibilityState={analyzing ? { busy: true } : undefined}
      contentContainerStyle={styles.strip}
    >
      {uris.map((uri, index) => {
        const gathering = gatheringUris.includes(uri);
        const gatherIndex = gatheringUris.indexOf(uri);

        return (
          <UnboundPhotoThumb
            key={uri}
            uri={uri}
            index={index}
            total={uris.length}
            activeTabLabel={activeTabLabel}
            analyzing={analyzing}
            gathering={gathering}
            gatherTranslateX={sandboxGatherTranslateX(uris, gatheringUris, uri)}
            gatherDelayMs={sandboxGatherDelayMs(gatherIndex)}
            gatherZIndex={gathering ? 10 - gatherIndex : 0}
            reduceMotion={reduceMotion}
            layout={layout}
            exiting={exiting}
            onPressPhoto={onPressPhoto}
            onDiscardPhoto={onDiscardPhoto}
          />
        );
      })}

      <Animated.View layout={layout}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Upload fotos"
          accessibilityHint="Åbner vælger til fotos eller filer"
          onPress={onUpload}
          style={({ pressed }) => [
            styles.uploadTile,
            {
              backgroundColor: theme.fillSecondary,
              borderColor: theme.borderSubtle,
            },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[typography.caption, { color: theme.contentSecondary }]}>Upload</Text>
        </Pressable>
      </Animated.View>
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: {
    gap: space.gapSm,
    alignItems: "center",
  },
  thumbWrap: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    overflow: "hidden",
    borderRadius: radius.md,
  },
  thumbWrapGathering: {
    overflow: "visible",
  },
  pressed: {
    opacity: 0.9,
  },
  thumb: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  thumbPulse: {
    borderRadius: radius.md,
  },
  discardHit: {
    position: "absolute",
    top: 0,
    right: 0,
    zIndex: 2,
    minWidth: 44,
    minHeight: 44,
    alignItems: "flex-end",
    justifyContent: "flex-start",
  },
  discardBadge: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadTile: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    minWidth: 44,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
});
