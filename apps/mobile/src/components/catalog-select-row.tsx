import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Mark } from "@/components/catalog-ui";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type CatalogSelectRowProps = {
  placeholder: string;
  value: string | null;
  meta?: string | null;
  onPress: () => void;
  disabled?: boolean;
};

/** Form trigger for a catalog picker — same row for club, season, and player. */
export function CatalogSelectRow({
  placeholder,
  value,
  meta,
  onPress,
  disabled = false,
}: CatalogSelectRowProps) {
  const theme = useTheme();
  const typography = useTypography();
  const isEmpty = !value;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isEmpty ? `${placeholder} ikke valgt` : value}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          borderColor: theme.borderSubtle,
          backgroundColor: theme.surface,
        },
        pressed && !disabled && { backgroundColor: theme.fillSecondary },
        disabled && styles.disabled,
      ]}
    >
      {value ? (
        <Mark label={value} />
      ) : (
        <View
          accessibilityElementsHidden
          style={[styles.emptyMark, { backgroundColor: theme.fillSecondary }]}
        />
      )}
      <View style={styles.body}>
        <Text
          style={[typography.body, { color: isEmpty ? theme.contentMuted : theme.contentPrimary }]}
        >
          {value ?? placeholder}
        </Text>
        {meta ? (
          <Text style={[typography.caption, { color: theme.contentMuted }]}>{meta}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.contentMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
    minHeight: 56,
    paddingHorizontal: space.insetMd,
    paddingVertical: space.insetSm,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  emptyMark: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
  },
  disabled: {
    opacity: 0.5,
  },
});
