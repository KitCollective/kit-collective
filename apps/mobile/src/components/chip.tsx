import { Pressable, StyleSheet, Text } from "react-native";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
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
  const typography = useTypography();

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
          typography.labelSm,
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
});
