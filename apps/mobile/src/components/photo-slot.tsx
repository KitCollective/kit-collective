import type { PhotoRole } from "@kit/domain";
import { PHOTO_ROLE_LABELS_DA } from "@kit/domain";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { color, radius, space, type } from "@/theme/tokens";

type PhotoSlotProps = {
  role: PhotoRole;
  uri?: string;
  onPress: () => void;
};

/**
 * Photo slot primitive (docs/design-system.md → Components → Photo slot).
 * Variant: confirm-strip — thumbnail with visible Danish role label.
 */
export function PhotoSlot({ role, uri, onPress }: PhotoSlotProps) {
  const roleLabel = PHOTO_ROLE_LABELS_DA[role];
  const isEmpty = !uri;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isEmpty ? `${roleLabel}, tom` : roleLabel}
      accessibilityHint={isEmpty ? "Tilføj foto" : "Erstat foto"}
      onPress={onPress}
      style={({ pressed }) => [styles.slot, pressed && styles.slotPressed]}
    >
      {isEmpty ? (
        <View style={styles.emptyPreview}>
          <Text style={styles.emptyText}>Tom</Text>
        </View>
      ) : (
        <Image source={{ uri }} style={styles.preview} accessibilityIgnoresInvertColors />
      )}
      <Text style={styles.roleLabel}>{roleLabel}</Text>
    </Pressable>
  );
}

const SLOT_WIDTH = 72;
const SLOT_HEIGHT = 90;

const styles = StyleSheet.create({
  slot: {
    width: SLOT_WIDTH,
    minHeight: 44,
    gap: space.gapSm,
  },
  slotPressed: {
    opacity: 0.9,
  },
  preview: {
    width: SLOT_WIDTH,
    height: SLOT_HEIGHT,
    borderRadius: radius.md,
    backgroundColor: color.fillSecondary,
  },
  emptyPreview: {
    width: SLOT_WIDTH,
    height: SLOT_HEIGHT,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: color.borderSubtle,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    color: color.contentMuted,
  },
  roleLabel: {
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    fontWeight: type.label.fontWeight,
    color: color.contentPrimary,
    textAlign: "center",
  },
});
