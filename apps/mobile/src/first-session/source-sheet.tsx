import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Sheet } from "@/components/catalog-ui";
import { Button } from "@/components/ui";
import type { OwnPhotoSource } from "@/first-session/own-photo-source";
import {
  SOURCE_CAMERA_HELPER,
  SOURCE_CAMERA_LABEL,
  SOURCE_CANCEL_LABEL,
  SOURCE_FILES_HELPER,
  SOURCE_FILES_LABEL,
  SOURCE_LIBRARY_HELPER,
  SOURCE_LIBRARY_LABEL,
  SOURCE_SHEET_SENTENCE,
  SOURCE_SHEET_TITLE,
} from "@/first-session/source-copy";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type SourceOption = {
  source: OwnPhotoSource;
  title: string;
  helper: string;
  icon: ComponentProps<typeof Ionicons>["name"];
};

const SOURCE_OPTIONS: readonly SourceOption[] = [
  {
    source: "camera",
    title: SOURCE_CAMERA_LABEL,
    helper: SOURCE_CAMERA_HELPER,
    icon: "camera-outline",
  },
  {
    source: "library",
    title: SOURCE_LIBRARY_LABEL,
    helper: SOURCE_LIBRARY_HELPER,
    icon: "images-outline",
  },
  {
    source: "files",
    title: SOURCE_FILES_LABEL,
    helper: SOURCE_FILES_HELPER,
    icon: "folder-outline",
  },
];

type FirstSessionSourceSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: (source: OwnPhotoSource) => void;
  onModalHide?: () => void;
};

/**
 * Source sheet over the welcome screen (Brug mit eget foto). Same anatomy as the
 * capture Chooser Sheet: each row is a direct action, a footer Annuller cancels,
 * no top-left Luk (docs/design-system.md -> Sheet, hideChrome).
 */
export function FirstSessionSourceSheet({
  visible,
  onDismiss,
  onConfirm,
  onModalHide,
}: FirstSessionSourceSheetProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <Sheet
      visible={visible}
      title={SOURCE_SHEET_TITLE}
      sentence={SOURCE_SHEET_SENTENCE}
      onDismiss={onDismiss}
      onModalHide={onModalHide}
      hideChrome
    >
      <View style={[styles.group, { borderColor: theme.borderSubtle }]}>
        {SOURCE_OPTIONS.map((option, index) => (
          <Pressable
            key={option.source}
            accessibilityRole="button"
            accessibilityLabel={`${option.title}. ${option.helper}`}
            testID={`source-sheet-${option.source}`}
            onPress={() => onConfirm(option.source)}
            style={({ pressed }) => [
              styles.row,
              index > 0 && { borderTopWidth: 1, borderTopColor: theme.borderSubtle },
              pressed && { backgroundColor: theme.fillSecondary },
            ]}
          >
            <Ionicons name={option.icon} size={22} color={theme.contentPrimary} />
            <View style={styles.rowBody}>
              <Text style={[typography.label, { color: theme.contentPrimary }]}>
                {option.title}
              </Text>
              <Text style={[typography.caption, { color: theme.contentSecondary }]}>
                {option.helper}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.contentMuted} />
          </Pressable>
        ))}
      </View>
      <Button
        label={SOURCE_CANCEL_LABEL}
        variant="tertiary"
        width="fill"
        testID="source-sheet-cancel"
        onPress={onDismiss}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  group: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
    minHeight: 56,
    paddingHorizontal: space.insetMd,
    paddingVertical: space.insetSm,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
});
