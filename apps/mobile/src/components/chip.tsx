import { Pressable, StyleSheet, Text } from "react-native";
import { color, radius, space, type } from "@/theme/tokens";

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress: () => void;
  /** Single-select groups use radio; multi-select uses button (design-system Chip). */
  accessibilityRole?: "button" | "radio";
};

export function Chip({
  label,
  selected = false,
  onPress,
  accessibilityRole = "button",
}: ChipProps) {
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
      ]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderSubtle,
    paddingHorizontal: space.insetMd,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.surface,
  },
  chipSelected: {
    backgroundColor: color.fillPrimary,
    borderColor: color.fillPrimary,
  },
  chipPressed: {
    opacity: 0.9,
  },
  label: {
    fontFamily: type.labelSm.fontFamily,
    fontSize: type.labelSm.fontSize,
    lineHeight: type.labelSm.lineHeight,
    color: color.contentPrimary,
  },
  labelSelected: {
    color: color.contentInverse,
  },
});
