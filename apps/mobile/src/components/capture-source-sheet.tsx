import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { useEffect, useState } from "react";
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
    title: "Upload filer",
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
 * Capture chooser for the tab-bar plus (docs/design-system.md → Patterns →
 * Capture session). Single-choice List rows, then Næste commits the source.
 */
export function CaptureSourceSheet({ visible, onDismiss, onConfirm }: CaptureSourceSheetProps) {
  const theme = useTheme();
  const typography = useTypography();
  // Nothing is preselected, so Næste always commits a deliberate choice.
  const [selected, setSelected] = useState<CaptureSource | null>(null);

  useEffect(() => {
    if (visible) {
      setSelected(null);
    }
  }, [visible]);

  return (
    <Sheet
      visible={visible}
      title="Tilføj trøje"
      sentence="Få billeder bliver én trøje. Mange billeder lander som uredigerede, som du binder til trøjer."
      onDismiss={onDismiss}
    >
      <View style={[styles.group, { borderColor: theme.borderSubtle }]}>
        {SOURCE_OPTIONS.map((option, index) => {
          const isSelected = option.source === selected;

          return (
            <Pressable
              key={option.source}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${option.title}. ${option.helper}`}
              onPress={() => setSelected(option.source)}
              style={({ pressed }) => [
                styles.row,
                index > 0 && { borderTopWidth: 1, borderTopColor: theme.borderSubtle },
                (isSelected || pressed) && { backgroundColor: theme.fillSecondary },
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
              {isSelected ? (
                <Ionicons name="checkmark" size={20} color={theme.fillPrimary} />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {selected === null ? (
        <Text style={[typography.caption, { color: theme.contentSecondary }]}>
          Vælg en mulighed for at fortsætte.
        </Text>
      ) : null}
      <Button
        label="Næste"
        width="fill"
        disabled={selected === null}
        onPress={() => {
          if (selected) {
            onConfirm(selected);
          }
        }}
      />
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
