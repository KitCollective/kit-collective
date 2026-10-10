import { Ionicons } from "@expo/vector-icons";
import type { PhotoRole } from "@kit/domain";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CONFIRM_ADD_PHOTO_LABEL, confirmPhotoStrip } from "@/capture/confirmPhotoStrip";
import { groupingStripUris, groupingViewerRoles, isGroupingWait } from "@/capture/groupingReveal";
import { ConfirmGroupingWait } from "@/components/confirm-grouping-wait";
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
  analyzing?: boolean;
  rollingUris?: string[];
  homecoming?: boolean;
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
  analyzing = false,
  rollingUris = [],
  homecoming = false,
  scanningFront,
}: ConfirmPhotoViewerProps) {
  const theme = useTheme();
  const typography = useTypography();
  const slotUris = analyzing ? groupingStripUris(rollingUris) : photoUris;
  const strip = confirmPhotoStrip(slotUris, { analyzing, photoCount });
  const roles = analyzing ? groupingViewerRoles(slotUris, true) : strip.roles;
  const waiting = isGroupingWait(slotUris, analyzing);

  return (
    <View style={[styles.canvas, { minHeight: CANVAS_HEIGHT }]}>
      {waiting ? <ConfirmGroupingWait /> : null}
      {waiting ? null : (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          accessibilityLabel="Fotos på denne trøje"
          accessibilityState={analyzing ? { busy: true } : undefined}
          contentContainerStyle={styles.strip}
        >
          {roles.map((role, index) => (
            <PhotoSlot
              key={slotUris[role] ?? role}
              role={role}
              uri={slotUris[role]}
              width={CONFIRM_VIEWER_WIDTH}
              labelPlacement={analyzing ? "none" : "overlay"}
              enter={analyzing ? (homecoming || index === 0 ? "fade" : "roll") : undefined}
              analyzing={analyzing}
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
      )}
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
