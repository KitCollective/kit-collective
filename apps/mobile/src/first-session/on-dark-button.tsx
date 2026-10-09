import { Pressable, StyleSheet, Text } from "react-native";
import { buttonLayoutStyles } from "@/components/button-layout";
import { useTypography } from "@/theme/brand-fonts";
import { color, withAlpha } from "@/theme/tokens";

const SECONDARY_FILL_ALPHA = 0.16;

type OnDarkButtonProps = {
  label: string;
  variant: "primary" | "secondary" | "tertiary";
  onPress: () => void;
};

/**
 * Full-width button for the dark first-session screens. The shared Button has
 * no on-dark variant yet (design-system gap, flagged), so this mirrors its
 * layout with inverse semantic tokens only.
 */
export function OnDarkButton({ label, variant, onPress }: OnDarkButtonProps) {
  const typography = useTypography();
  const labelColor = variant === "primary" ? color.contentPrimary : color.contentInverse;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        buttonLayoutStyles("fill"),
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "tertiary" && styles.tertiary,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[typography.label, { color: labelColor }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primary: { backgroundColor: color.surface },
  secondary: { backgroundColor: withAlpha(color.contentInverse, SECONDARY_FILL_ALPHA) },
  tertiary: { backgroundColor: "transparent" },
  pressed: { opacity: 0.9 },
});
