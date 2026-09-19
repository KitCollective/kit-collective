import type { PhotoRole } from "@kit/domain";
import { PHOTO_ROLE_LABELS_DA } from "@kit/domain";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeOut, Keyframe } from "react-native-reanimated";
import { ConfirmAnalyzingPulse, SKELETON_BONE_ALPHA } from "@/components/confirm-analyzing-pulse";
import { useTypography } from "@/theme/brand-fonts";
import { motion, radius, space, withAlpha } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

const LOCK_EASE = Easing.bezier(0.4, 0, 0.2, 1);

const SLOT_FADE_ENTERING = new Keyframe({
  0: { opacity: 0 },
  100: { opacity: 1, easing: LOCK_EASE },
}).duration(motion.slow);

const SLOT_ROLL_ENTERING = new Keyframe({
  0: {
    opacity: 0,
    transform: [{ translateX: -space.insetMd }],
  },
  100: {
    opacity: 1,
    transform: [{ translateX: 0 }],
    easing: LOCK_EASE,
  },
}).duration(motion.slow);

type PhotoSlotVariant = "confirm-strip" | "camera-overlay" | "add";
type PhotoSlotLabelPlacement = "below" | "overlay" | "none";
type PhotoSlotEnter = "fade" | "roll";

type PhotoSlotProps = {
  role: PhotoRole;
  uri?: string;
  caption?: string;
  variant?: PhotoSlotVariant;
  selected?: boolean;
  width?: number;
  labelPlacement?: PhotoSlotLabelPlacement;
  enter?: PhotoSlotEnter;
  analyzing?: boolean;
  onPress: () => void;
};

/** 4:5 jersey photo tile — design-system Layout (photo dominates, tile clips to radius). */
function photoSlotHeight(width: number): number {
  return (width * 5) / 4;
}

const CONFIRM_WIDTH = space.insetLg * 3;
const OVERLAY_WIDTH = space.insetMd * 3 + space.gapSm;

/** Larger Confirm hub viewer tile (`space.inset.lg × 6`). */
export const CONFIRM_VIEWER_WIDTH = space.insetLg * 6;

/**
 * Photo slot primitive (docs/design-system.md → Components → Photo slot).
 */
export function PhotoSlot({
  role,
  uri,
  caption,
  variant = "confirm-strip",
  selected = false,
  width,
  labelPlacement,
  enter,
  analyzing = false,
  onPress,
}: PhotoSlotProps) {
  const theme = useTheme();
  const typography = useTypography();
  const reduceMotion = useReduceMotion();
  const isAdd = variant === "add";
  const roleLabel = isAdd
    ? "Tilføj foto"
    : role === "other"
      ? caption?.trim() || PHOTO_ROLE_LABELS_DA.other
      : PHOTO_ROLE_LABELS_DA[role];
  const isEmpty = !uri;
  const isOverlay = variant === "camera-overlay";
  const slotWidth = width ?? (isOverlay ? OVERLAY_WIDTH : CONFIRM_WIDTH);
  const slotHeight = photoSlotHeight(slotWidth);
  const placement = labelPlacement ?? "below";
  const belowLabelColor = isOverlay ? theme.contentInverse : theme.contentPrimary;
  const hideChrome = placement === "none";
  const overlayBadge =
    placement === "overlay" ? (
      <View
        style={[styles.overlayBadge, { backgroundColor: theme.fillPrimary }]}
        accessibilityElementsHidden
      >
        <Text style={[typography.captionSm, { color: theme.contentInverse }]}>{roleLabel}</Text>
      </View>
    ) : null;

  return (
    <Animated.View
      exiting={
        !reduceMotion && analyzing ? FadeOut.duration(motion.fast).easing(LOCK_EASE) : undefined
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          isAdd
            ? "Tilføj foto, tom"
            : isEmpty
              ? `${roleLabel}, tom`
              : selected
                ? `${roleLabel}, valgt`
                : roleLabel
        }
        accessibilityHint={isEmpty || isAdd ? "Tilføj foto" : "Erstat foto"}
        accessibilityState={analyzing ? { busy: true } : undefined}
        onPress={onPress}
        style={({ pressed }) => [styles.slot, { width: slotWidth }, pressed && styles.slotPressed]}
      >
        {hideChrome ? (
          <Animated.View
            entering={!reduceMotion && enter === "roll" ? SLOT_ROLL_ENTERING : undefined}
            style={[
              styles.previewWrap,
              styles.groupingPreview,
              { width: slotWidth, height: slotHeight },
            ]}
          >
            {isEmpty || enter === "fade" ? (
              <ConfirmAnalyzingPulse
                color={withAlpha(theme.fillPrimary, SKELETON_BONE_ALPHA)}
                style={styles.slotPulse}
              />
            ) : null}
            {uri ? (
              <Animated.Image
                entering={!reduceMotion && enter === "fade" ? SLOT_FADE_ENTERING : undefined}
                source={{ uri }}
                style={{ width: slotWidth, height: slotHeight }}
                accessibilityIgnoresInvertColors
              />
            ) : null}
          </Animated.View>
        ) : isEmpty ? (
          <View
            style={[
              styles.emptyPreview,
              {
                width: slotWidth,
                height: slotHeight,
                backgroundColor: theme.surface,
                opacity: isOverlay ? 0.75 : 1,
                borderColor: theme.borderSubtle,
                justifyContent: "center",
              },
              selected && isOverlay && { borderColor: theme.contentInverse, borderWidth: 2 },
            ]}
          >
            {placement === "overlay" ? (
              overlayBadge
            ) : (
              <Text
                style={[
                  typography.caption,
                  { color: isOverlay ? theme.contentInverse : theme.contentMuted },
                ]}
              >
                {isAdd ? "+" : "Tom"}
              </Text>
            )}
          </View>
        ) : (
          <View
            style={[
              styles.previewWrap,
              {
                width: slotWidth,
                height: slotHeight,
                backgroundColor: theme.fillSecondary,
                borderColor: theme.borderSubtle,
              },
              selected && isOverlay && { borderColor: theme.contentInverse, borderWidth: 2 },
            ]}
          >
            <Image
              source={{ uri }}
              style={{ width: slotWidth, height: slotHeight }}
              accessibilityIgnoresInvertColors
            />
            {overlayBadge}
          </View>
        )}
        {placement === "below" ? (
          <Text style={[typography.labelSm, { color: belowLabelColor, textAlign: "center" }]}>
            {roleLabel}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  slot: {
    minHeight: 44,
    gap: space.gapSm,
  },
  slotPressed: {
    opacity: 0.9,
  },
  previewWrap: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  groupingPreview: {
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  emptyPreview: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  overlayBadge: {
    position: "absolute",
    top: space.insetSm,
    left: space.insetSm,
    borderRadius: radius.pill,
    paddingHorizontal: space.insetSm,
    zIndex: 1,
  },
  slotPulse: {
    borderRadius: radius.md,
  },
});
