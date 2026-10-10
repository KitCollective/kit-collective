import { Ionicons } from "@expo/vector-icons";
import type { PhotoRole } from "@kit/domain";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CONFIRM_ADD_PHOTO_LABEL, confirmPhotoStrip } from "@/capture/confirmPhotoStrip";
import { CONFIRM_VIEWER_WIDTH, PhotoSlot } from "@/components/photo-slot";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

const CANVAS_HEIGHT = (CONFIRM_VIEWER_WIDTH * 5) / 4;
/** One narrow tile: a third of a photo slot wide, the same 4:5 height. */
const ADD_TILE_WIDTH = space.insetLg * 3;

type ConfirmPhotoViewerProps = {
  photoUris: Record<PhotoRole, string | undefined>;
  /** Photos bound to this jersey, so the strip knows when the 10 cap is reached. */
  photoCount: number;
  onPressRole: (role: PhotoRole) => void;
  /** Opens the picker. The Foto tile; there is no Upload tile and no empty role slot. */
  onAddPhoto: () => void;
  /** True while the first identity read of the front photo runs (once per photo). */
  scanningFront?: boolean;
};

/**
 * Horizontal strip for the active jersey: filled 4:5 slots only, then one narrow Foto tile
 * (design lock: Confirm and Save, Revision 2026-10-09, item 6). No outer frame.
 */
export function ConfirmPhotoViewer({
  photoUris,
  photoCount,
  onPressRole,
  onAddPhoto,
  scanningFront,
}: ConfirmPhotoViewerProps) {
  const theme = useTheme();
  const typography = useTypography();
  const strip = confirmPhotoStrip(photoUris, { photoCount });

  return (
    <View style={[styles.canvas, { minHeight: CANVAS_HEIGHT }]}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        accessibilityLabel="Fotos på denne trøje"
        contentContainerStyle={styles.strip}
      >
        {strip.roles.map((role) => (
          <PhotoSlot
            key={photoUris[role] ?? role}
            role={role}
            uri={photoUris[role]}
            width={CONFIRM_VIEWER_WIDTH}
            labelPlacement="overlay"
            scanning={role === "front" ? scanningFront : undefined}
            onPress={() => onPressRole(role)}
          />
        ))}
        {strip.showAddTile ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tilføj foto"
            testID="confirm-add-photo"
            onPress={onAddPhoto}
            style={({ pressed }) => [
              styles.addTile,
              { backgroundColor: theme.fillSecondary },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="add"
              size={24}
              color={theme.contentPrimary}
              accessibilityElementsHidden
            />
            <Text style={[typography.caption, { color: theme.contentPrimary }]}>
              {CONFIRM_ADD_PHOTO_LABEL}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
      {strip.capHelper ? (
        <Text style={[typography.caption, { color: theme.contentMuted }]}>{strip.capHelper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    width: "100%",
    gap: space.gapSm,
  },
  strip: {
    flexDirection: "row",
    gap: space.gapSm,
  },
  addTile: {
    width: ADD_TILE_WIDTH,
    height: CANVAS_HEIGHT,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    gap: space.gapSm / 2,
  },
  pressed: {
    opacity: 0.9,
  },
});
