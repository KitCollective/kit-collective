import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type InboxJerseyFilterChipProps = {
  /** The jersey's kit line (club and season); null while the Indbakke has not loaded. */
  kitLine: string | null;
  onClear: () => void;
};

/**
 * The quiet way out of "Indbakke for this jersey". It draws the same selected pill as the
 * Samling view chip (fill.primary, labelSm, clear cross): the lock has no mobile filter Chip
 * variant yet (design gap).
 */
export function InboxJerseyFilterChip({ kitLine, onClear }: InboxJerseyFilterChipProps) {
  const theme = useTheme();
  const typography = useTypography();
  const label = kitLine ?? "Denne trøje";

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Fjern filter, ${label}`}
        testID="inbox-jersey-filter"
        onPress={onClear}
        style={({ pressed }) => [
          styles.chip,
          { backgroundColor: theme.fillPrimary },
          pressed && styles.pressed,
        ]}
      >
        <Text
          style={[typography.labelSm, styles.label, { color: theme.contentInverse }]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Ionicons name="close" size={18} color={theme.contentInverse} accessibilityElementsHidden />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    paddingHorizontal: space.insetMd,
    paddingVertical: space.insetSm,
  },
  chip: {
    minHeight: 44,
    maxWidth: "100%",
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm,
    paddingLeft: space.insetMd,
    paddingRight: space.insetSm,
  },
  label: {
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.8,
  },
});
