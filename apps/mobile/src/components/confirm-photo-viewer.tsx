import { PHOTO_ROLES, type PhotoRole } from "@kit/domain";
import { ScrollView, StyleSheet } from "react-native";
import { CONFIRM_VIEWER_WIDTH, PhotoSlot } from "@/components/photo-slot";
import { space } from "@/theme/tokens";

type ConfirmPhotoViewerProps = {
  photoUris: Record<PhotoRole, string | undefined>;
  onPressRole: (role: PhotoRole) => void;
};

/**
 * Horizontal viewer for the active jersey's Photo slots — photos only, no outer frame.
 */
export function ConfirmPhotoViewer({ photoUris, onPressRole }: ConfirmPhotoViewerProps) {
  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      accessibilityLabel="Fotos på denne trøje"
      contentContainerStyle={styles.strip}
    >
      {PHOTO_ROLES.map((role) => (
        <PhotoSlot
          key={role}
          role={role}
          uri={photoUris[role]}
          width={CONFIRM_VIEWER_WIDTH}
          labelPlacement="overlay"
          onPress={() => onPressRole(role)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    gap: space.gapSm,
  },
});
