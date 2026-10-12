import { Pressable, StyleSheet, Text } from "react-native";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type CollectionChipProps = {
  label: string;
  /** Optional count after the label, in `mono`. */
  count?: number;
  selected?: boolean;
  onPress: () => void;
  testID?: string;
};

/**
 * Samling chip, Revision 2026-10-10: unselected is `fill.secondary` with no border, selected
 * is `fill.primary`. The shared `Chip` (surface + border, one string label) is Confirm's
 * chip and stays as it is, so the Samling row and the Vis og sortér sheet draw this pill.
 */
export function CollectionChip({
  label,
  count,
  selected = false,
  onPress,
  testID,
}: CollectionChipProps) {
  const theme = useTheme();
  const typography = useTypography();
  const textColor = selected ? theme.contentInverse : theme.contentPrimary;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={count === undefined ? label : `${label}, ${count}`}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? theme.fillPrimary : theme.fillSecondary },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[typography.labelSm, { color: textColor }]}>{label}</Text>
      {count === undefined ? null : (
        <Text style={[typography.monoSm, { color: textColor }]}>{count}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    borderRadius: radius.pill,
    paddingHorizontal: space.insetMd,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.gapSm,
  },
  pressed: {
    opacity: 0.9,
  },
});
