import type { PhotoRole } from "@kit/domain";
import { ScrollView, StyleSheet, View } from "react-native";
import { groupingStripUris, groupingViewerRoles, isGroupingWait } from "@/capture/groupingReveal";
import { ConfirmGroupingWait } from "@/components/confirm-grouping-wait";
import { CONFIRM_VIEWER_WIDTH, PhotoSlot } from "@/components/photo-slot";
import { space } from "@/theme/tokens";

const CANVAS_HEIGHT = (CONFIRM_VIEWER_WIDTH * 5) / 4;

type ConfirmPhotoViewerProps = {
  photoUris: Record<PhotoRole, string | undefined>;
  onPressRole: (role: PhotoRole) => void;
  analyzing?: boolean;
  rollingUris?: string[];
  homecoming?: boolean;
};

/**
 * Horizontal viewer for the active jersey's Photo slots — photos only, no outer frame.
 */
export function ConfirmPhotoViewer({
  photoUris,
  onPressRole,
  analyzing = false,
  rollingUris = [],
  homecoming = false,
}: ConfirmPhotoViewerProps) {
  const slotUris = analyzing ? groupingStripUris(rollingUris) : photoUris;
  const roles = groupingViewerRoles(slotUris, analyzing);
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
              enter={
                analyzing ? (homecoming || index === 0 ? "fade" : "roll") : undefined
              }
              analyzing={analyzing}
              onPress={() => onPressRole(role)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    width: "100%",
  },
  strip: {
    flexDirection: "row",
    gap: space.gapSm,
  },
});
