import { Ionicons } from "@expo/vector-icons";
import { PHOTO_ROLE_LABELS_DA, PHOTO_ROLES, type PhotoRole } from "@kit/domain";
import { Image, Modal, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chip } from "@/components/chip";
import { Button, ButtonDock } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space, withAlpha } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type PhotoLightboxProps = {
  visible: boolean;
  role: PhotoRole;
  uri: string;
  label?: string;
  onDismiss: () => void;
  onReplace: () => void;
  onDelete: () => void;
  onChangeRole: (toRole: PhotoRole) => void;
  onChangeLabel?: (label: string) => void;
};

/** Full-size photo preview with replace, delete, and role-change actions (KIT-208). */
export function PhotoLightbox({
  visible,
  role,
  uri,
  label = "",
  onDismiss,
  onReplace,
  onDelete,
  onChangeRole,
  onChangeLabel,
}: PhotoLightboxProps) {
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const previewWidth = Math.min(windowWidth - space.insetLg * 2, 360);
  const previewHeight = (previewWidth * 5) / 4;
  const roleLabel =
    role === "other" ? (label.trim() || PHOTO_ROLE_LABELS_DA.other) : PHOTO_ROLE_LABELS_DA[role];
  const suggestionLabels = ["Vaskemærke", "ID-kode", "Slitage"];

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
            <Ionicons
              name="close"
              size={22}
              color={theme.contentPrimary}
              accessibilityElementsHidden
            />
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

          {role === "other" ? (
            <View style={styles.roleRow}>
              <Text style={[typography.caption, { color: theme.contentMuted }]}>Beskrivelse</Text>
              <TextInput
                accessibilityLabel="Beskrivelse"
                placeholder="f.eks. Vaskemærke"
                placeholderTextColor={theme.contentMuted}
                value={label}
                onChangeText={onChangeLabel}
                style={[
                  styles.descriptionInput,
                  {
                    color: theme.contentPrimary,
                    borderColor: theme.borderSubtle,
                    backgroundColor: theme.surface,
                  },
                ]}
              />
              <View style={styles.chipRow}>
                {suggestionLabels.map((suggestion) => (
                  <Chip
                    key={suggestion}
                    label={suggestion}
                    selected={label === suggestion}
                    onPress={() => onChangeLabel?.(suggestion)}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </View>

        <ButtonDock>
          <Button label="Erstat" variant="secondary" width="fill" onPress={onReplace} />
          <Button label="Slet" variant="destructive" width="fill" onPress={onDelete} />
        </ButtonDock>
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
  descriptionInput: {
    width: "100%",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.insetMd,
    paddingVertical: space.insetSm,
    minHeight: 44,
  },
});
