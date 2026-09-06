import type { PhotoRole } from "@kit/domain";
import { PHOTO_ROLE_LABELS_DA } from "@kit/domain";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type PhotoSlotVariant = "confirm-strip" | "camera-overlay" | "add";
type PhotoSlotLabelPlacement = "below" | "overlay";

type PhotoSlotProps = {
  role: PhotoRole;
  uri?: string;
  caption?: string;
  variant?: PhotoSlotVariant;
  selected?: boolean;
  width?: number;
  labelPlacement?: PhotoSlotLabelPlacement;
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
  onPress,
}: PhotoSlotProps) {
  const theme = useTheme();
  const typography = useTypography();
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
      onPress={onPress}
      style={({ pressed }) => [styles.slot, { width: slotWidth }, pressed && styles.slotPressed]}
    >
      {isEmpty ? (
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
  },
});
