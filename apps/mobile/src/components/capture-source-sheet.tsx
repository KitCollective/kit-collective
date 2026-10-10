import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CaptureSource } from "@/capture/captureSourceFlow";
import { CHOOSER_VISION_COPY, type ChooserVisionModel } from "@/capture/chooserVision";
import { Sheet } from "@/components/catalog-ui";
import { SwitchControl } from "@/components/profile-ui";
import { Button } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type CaptureSourceSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: (source: CaptureSource) => void;
  onModalHide?: () => void;
  vision: ChooserVisionModel;
  onVisionChange: (next: boolean) => void;
  /** Out of quota the helper is a link; the host presents KitCollective+ after the Sheet closes. */
  onOpenPaywall: () => void;
};

type SourceOption = {
  source: CaptureSource;
  title: string;
  helper: string;
  icon: ComponentProps<typeof Ionicons>["name"];
};

const SOURCE_OPTIONS: readonly SourceOption[] = [
  {
    source: "camera",
    title: "Tag billeder",
    helper: "Kamera",
    icon: "camera-outline",
  },
  {
    source: "gallery",
    title: "Vælg billeder",
    helper: "Fotos eller filer",
    icon: "images-outline",
  },
];

/** Switch-off dimming. The lock names `opacity.disabled` but gives no value; matches the Profil switch. */
const DISABLED_OPACITY = 0.4;

/**
 * Capture chooser for the Samling capture button (docs/design-system.md → Patterns →
 * Capture session, Revision 2026-10-09). Two equal tiles, each a direct action: tapping one
 * commits the source and dismisses the Sheet. The Sheet never asks single versus bulk — the
 * photo count decides. Under a hairline the Vision row holds the per-device switch and, for
 * a free collector, the remaining allowance. The top-left Luk is omitted; a footer Annuller
 * cancels instead (swipe-down + scrim still dismiss too).
 */
export function CaptureSourceSheet({
  visible,
  onDismiss,
  onConfirm,
  onModalHide,
  vision,
  onVisionChange,
  onOpenPaywall,
}: CaptureSourceSheetProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <Sheet
      visible={visible}
      title="Tilføj trøje"
      sentence={vision.caption}
      onDismiss={onDismiss}
      onModalHide={onModalHide}
      hideChrome
    >
      <View style={styles.tiles}>
        {SOURCE_OPTIONS.map((option) => (
          <Pressable
            key={option.source}
            accessibilityRole="button"
            accessibilityLabel={`${option.title}. ${option.helper}`}
            testID={`capture-source-${option.source}`}
            onPress={() => onConfirm(option.source)}
            style={({ pressed }) => [
              styles.tile,
              { backgroundColor: theme.fillSecondary },
              pressed && styles.tilePressed,
            ]}
          >
            <Ionicons name={option.icon} size={24} color={theme.contentPrimary} />
            <View style={styles.tileText}>
              <Text style={[typography.label, { color: theme.contentPrimary }]}>
                {option.title}
              </Text>
              <Text style={[typography.caption, { color: theme.contentSecondary }]}>
                {option.helper}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
      <View
        style={[styles.visionRow, { borderTopColor: theme.borderSubtle }]}
        testID="capture-vision-row"
      >
        <Ionicons
          name="sparkles-outline"
          size={22}
          color={theme.contentPrimary}
          accessibilityElementsHidden
        />
        <View style={[styles.visionBody, vision.switchDisabled && { opacity: DISABLED_OPACITY }]}>
          <Text style={[typography.label, { color: theme.contentPrimary }]}>
            {CHOOSER_VISION_COPY.label}
          </Text>
          {vision.helperIsLink ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={vision.helper}
              testID="capture-vision-upgrade"
              onPress={onOpenPaywall}
              hitSlop={8}
            >
              <Text
                style={[
                  typography.caption,
                  { color: theme.contentPrimary, textDecorationLine: "underline" },
                ]}
              >
                {vision.helper}
              </Text>
            </Pressable>
          ) : (
            <Text style={[typography.caption, { color: theme.contentSecondary }]}>
              {vision.helper}
            </Text>
          )}
          {vision.quotaLine ? (
            <Text
              testID="capture-vision-quota"
              style={[
                typography.mono,
                { color: vision.quotaTone === "danger" ? theme.danger : theme.contentSecondary },
              ]}
            >
              {vision.quotaLine}
            </Text>
          ) : null}
        </View>
        <View style={vision.switchDisabled ? { opacity: DISABLED_OPACITY } : undefined}>
          <SwitchControl
            value={vision.switchOn}
            disabled={vision.switchDisabled}
            onValueChange={onVisionChange}
            accessibilityLabel={CHOOSER_VISION_COPY.label}
            testID="capture-vision-switch"
          />
        </View>
      </View>
      <Button label="Annuller" variant="tertiary" width="fill" onPress={onDismiss} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  tiles: {
    flexDirection: "row",
    gap: space.gapMd,
  },
  tile: {
    flex: 1,
    minHeight: 112,
    borderRadius: radius.md,
    padding: space.insetMd,
    justifyContent: "space-between",
  },
  tilePressed: {
    opacity: 0.8,
  },
  tileText: {
    gap: 2,
  },
  visionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
    borderTopWidth: 1,
    paddingTop: space.insetMd,
  },
  visionBody: {
    flex: 1,
    gap: 2,
  },
});
