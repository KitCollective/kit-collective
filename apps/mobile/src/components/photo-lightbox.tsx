import { PHOTO_ROLES, PHOTO_ROLE_LABELS_DA, type PhotoRole } from "@kit/domain";
import { Ionicons } from "@expo/vector-icons";
import { Image, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chip } from "@/components/chip";
import { Button } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space, withAlpha } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type PhotoLightboxProps = {
  visible: boolean;
  role: PhotoRole;
  uri: string;
  onDismiss: () => void;
  onReplace: () => void;
  onDelete: () => void;
  onChangeRole: (toRole: PhotoRole) => void;
};

/** Full-size photo preview with replace, delete, and role-change actions (design lock → Photo lightbox). */
export function PhotoLightbox({
  visible,
  role,
  uri,
  onDismiss,
  onReplace,
  onDelete,
  onChangeRole,
}: PhotoLightboxProps) {
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const previewWidth = Math.min(windowWidth - space.insetLg * 2, 360);
  const previewHeight = (previewWidth * 5) / 4;
  const roleLabel = PHOTO_ROLE_LABELS_DA[role];

  return (
    <Modal
      animationType="fade"
      transparent={false}
      visible={visible}
      onRequestClose={onDismiss}
      accessibilityViewIsModal
    >
      <View style={[styles.root, { backgroundColor: theme.canvas, paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Luk"
            onPress={onDismiss}
            style={({ pressed }) => [
              styles.chromeButton,
              { backgroundColor: withAlpha(theme.contentPrimary, 0.06) },
              pressed && styles.chromePressed,
            ]}
          >
            <Ionicons name="close" size={22} color={theme.contentPrimary} accessibilityElementsHidden />
          </Pressable>
        </View>

        <View style={styles.body}>
          <Image
            source={{ uri }}
            style={[
              styles.preview,
              {
                width: previewWidth,
                height: previewHeight,
                backgroundColor: theme.fillSecondary,
                borderColor: theme.borderSubtle,
              },
            ]}
            accessibilityLabel={`${roleLabel} foto`}
            accessibilityIgnoresInvertColors
          />
          <Text style={[typography.label, { color: theme.contentPrimary }]}>{roleLabel}</Text>

          <View style={styles.roleRow}>
            <Text style={[typography.caption, { color: theme.contentMuted }]}>Skift rolle</Text>
            <View style={styles.chipRow}>
              {PHOTO_ROLES.map((candidate) => (
                <Chip
                  key={candidate}
                  label={PHOTO_ROLE_LABELS_DA[candidate]}
                  selected={candidate === role}
                  accessibilityRole="radio"
                  onPress={() => {
                    if (candidate !== role) {
                      onChangeRole(candidate);
                    }
                  }}
                />
              ))}
            </View>
          </View>
        </View>

        <View
          style={[
            styles.actions,
            {
              paddingBottom: Math.max(insets.bottom, space.insetMd),
              borderTopColor: theme.borderSubtle,
              backgroundColor: theme.canvas,
            },
          ]}
        >
          <Button label="Erstat" variant="secondary" width="fill" onPress={onReplace} />
          <Button label="Slet" variant="destructive" width="fill" onPress={onDelete} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingHorizontal: space.insetMd,
    paddingVertical: space.insetSm,
    minHeight: 44,
    justifyContent: "center",
  },
  chromeButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  chromePressed: {
    opacity: 0.85,
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.gapMd,
    paddingHorizontal: space.insetLg,
  },
  preview: {
    borderRadius: radius.md,
    borderWidth: 1,
  },
  roleRow: {
    width: "100%",
    gap: space.gapSm,
    alignItems: "center",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: space.gapSm,
  },
  actions: {
    gap: space.gapSm,
    paddingHorizontal: space.insetLg,
    paddingTop: space.insetMd,
    borderTopWidth: 1,
  },
});
