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

const CONFIRM_WIDTH = 72;
const CONFIRM_HEIGHT = 90;
const OVERLAY_WIDTH = 56;
const OVERLAY_HEIGHT = 70;

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
              backgroundColor: isOverlay ? color.surface : color.surface,
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
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    fontWeight: type.label.fontWeight,
    textAlign: "center",
  },
});
