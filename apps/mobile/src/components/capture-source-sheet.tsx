import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CaptureSource } from "@/capture/captureSourceFlow";
import { Sheet } from "@/components/catalog-ui";
import { Button } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type CaptureSourceSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: (source: CaptureSource) => void;
  onModalHide?: () => void;
};

type SourceOption = {
  source: CaptureSource;
  title: string;
  helper: string;
  icon: ComponentProps<typeof Ionicons>["name"];
};

const SOURCE_OPTIONS: readonly SourceOption[] = [
  {
    source: "gallery",
    title: "Upload billeder",
    helper: "Vælg billeder fra galleri eller filer.",
    icon: "images-outline",
  },
  {
    source: "camera",
    title: "Tag billede",
    helper: "Fotografér trøjen med kameraet nu.",
    icon: "camera-outline",
  },
];

/**
 * Capture chooser for the Samling capture button (docs/design-system.md → Patterns →
 * Capture session). Each row is a direct action: tapping it commits the source and
 * dismisses the Sheet, and the trailing chevron marks it as a step forward. There is
 * no separate commit button — the row is the commit. The top-left Luk is omitted; a
 * footer Annuller cancels instead (swipe-down + scrim still dismiss too).
 */
export function CaptureSourceSheet({
  visible,
  onDismiss,
  onConfirm,
  onModalHide,
}: CaptureSourceSheetProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <Sheet
      visible={visible}
      title="Tilføj trøje"
      sentence="Få billeder bliver én trøje. Mange lander som uredigerede."
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
      <Button label="Annuller" variant="tertiary" width="fill" onPress={onDismiss} />
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
