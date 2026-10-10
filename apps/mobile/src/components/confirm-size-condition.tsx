import {
  JERSEY_CONDITION_LABELS_DA,
  JERSEY_CONDITIONS,
  JERSEY_SIZE_LABELS_DA,
  JERSEY_SIZES,
} from "@kit/domain";
import { StyleSheet, Text, View } from "react-native";
import { selectDraftCondition, selectDraftSize } from "@/capture/captureSession";
import type { CaptureJerseyDraft, CaptureSessionMutator } from "@/capture/captureSessionTypes";
import { Chip } from "@/components/chip";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type ConfirmSizeConditionProps = {
  draft: CaptureJerseyDraft;
  mutate: CaptureSessionMutator;
};

/**
 * Størrelse and Stand as Chip single-select groups on the hub, each under a `type.label`
 * heading (design lock: Confirm and Save, Revision 2026-10-09, item 1). Size may arrive
 * pre-selected (last saved size); condition never does.
 */
export function ConfirmSizeCondition({ draft, mutate }: ConfirmSizeConditionProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <View style={styles.groups}>
      <View style={styles.section}>
        <Text style={[typography.label, { color: theme.contentPrimary }]}>Størrelse</Text>
        <View accessibilityRole="radiogroup" style={styles.chipRow}>
          {JERSEY_SIZES.map((value) => (
            <Chip
              key={value}
              label={JERSEY_SIZE_LABELS_DA[value]}
              testID={`detail-size-${value}`}
              selected={draft.sizeSelected && draft.size === value}
              accessibilityRole="radio"
              onPress={() => {
                mutate((current) => selectDraftSize(current, current.activeDraftId, value));
              }}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[typography.label, { color: theme.contentPrimary }]}>Stand</Text>
        <View accessibilityRole="radiogroup" style={styles.chipRow}>
          {JERSEY_CONDITIONS.map((value) => (
            <Chip
              key={value}
              label={JERSEY_CONDITION_LABELS_DA[value]}
              testID={`detail-condition-${value}`}
              selected={draft.conditionSelected && draft.condition === value}
              accessibilityRole="radio"
              onPress={() => {
                mutate((current) => selectDraftCondition(current, current.activeDraftId, value));
              }}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  groups: {
    gap: space.gapLg,
  },
  section: {
    gap: space.gapSm,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.gapSm,
  },
});
