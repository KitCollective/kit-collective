import { Pressable, StyleSheet, Text } from "react-native";
import { radius, space, type } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

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
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: theme.borderSubtle,
          backgroundColor: theme.surface,
        },
        selected && {
          backgroundColor: theme.fillPrimary,
          borderColor: theme.fillPrimary,
        },
        pressed && styles.chipPressed,
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: theme.contentPrimary },
          selected && { color: theme.contentInverse },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.insetMd,
    alignItems: "center",
    justifyContent: "center",
  },
  chipPressed: {
    opacity: 0.9,
  },
  label: {
    fontFamily: type.labelSm.fontFamily,
    fontSize: type.labelSm.fontSize,
    lineHeight: type.labelSm.lineHeight,
  },
});
