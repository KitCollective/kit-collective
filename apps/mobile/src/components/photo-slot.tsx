import type { PhotoRole } from "@kit/domain";
import { PHOTO_ROLE_LABELS_DA } from "@kit/domain";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { color, radius, space, type } from "@/theme/tokens";

type PhotoSlotVariant = "confirm-strip" | "camera-overlay";

type PhotoSlotProps = {
  role: PhotoRole;
  uri?: string;
  variant?: PhotoSlotVariant;
  selected?: boolean;
  onPress: () => void;
};

/** 4:5 jersey photo tile — design-system Layout (photo dominates, tile clips to radius). */
function photoSlotHeight(width: number): number {
  return (width * 5) / 4;
}

const CONFIRM_WIDTH = space.insetLg * 3;
const CONFIRM_HEIGHT = photoSlotHeight(CONFIRM_WIDTH);
const OVERLAY_WIDTH = space.insetMd * 3 + space.gapSm;
const OVERLAY_HEIGHT = photoSlotHeight(OVERLAY_WIDTH);

/**
 * Photo slot primitive (docs/design-system.md → Components → Photo slot).
 */
export function PhotoSlot({
  role,
  uri,
  variant = "confirm-strip",
  selected = false,
  onPress,
}: PhotoSlotProps) {
  const roleLabel = PHOTO_ROLE_LABELS_DA[role];
  const isEmpty = !uri;
  const isOverlay = variant === "camera-overlay";
  const slotWidth = isOverlay ? OVERLAY_WIDTH : CONFIRM_WIDTH;
  const slotHeight = isOverlay ? OVERLAY_HEIGHT : CONFIRM_HEIGHT;
  const labelColor = isOverlay ? color.contentInverse : color.contentPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        isEmpty ? `${roleLabel}, tom` : selected ? `${roleLabel}, valgt` : roleLabel
      }
      accessibilityHint={isEmpty ? "Tilføj foto" : "Erstat foto"}
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
              backgroundColor: color.surface,
              opacity: isOverlay ? 0.75 : 1,
            },
            selected && isOverlay && styles.overlaySelected,
          ]}
        >
          <Text style={[styles.emptyText, isOverlay && styles.emptyTextInverse]}>Tom</Text>
        </View>
      ) : (
        <Image
          source={{ uri }}
          style={[
            styles.preview,
            {
              width: slotWidth,
              height: slotHeight,
            },
            selected && isOverlay && styles.overlaySelected,
          ]}
          accessibilityIgnoresInvertColors
        />
      )}
      <Text style={[styles.roleLabel, { color: labelColor }]}>{roleLabel}</Text>
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
  preview: {
    borderRadius: radius.md,
    backgroundColor: color.fillSecondary,
    borderWidth: 1,
    borderColor: color.borderSubtle,
  },
  emptyPreview: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: color.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  overlaySelected: {
    borderWidth: 2,
    borderColor: color.contentInverse,
  },
  emptyText: {
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    color: color.contentMuted,
  },
  emptyTextInverse: {
    color: color.contentInverse,
  },
  roleLabel: {
    fontFamily: type.label.fontFamily,
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    textAlign: "center",
  },
});
