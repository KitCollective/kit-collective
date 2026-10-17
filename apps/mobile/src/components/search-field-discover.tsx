import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, TextInput, type TextInputProps, View } from "react-native";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type SearchFieldDiscoverProps = TextInputProps & {
  /** Required: the placeholder is not a label substitute. */
  accessibilityLabel: string;
  onClear?: () => void;
};

/**
 * Search field, `discover` variant (docs/design-system.md → Search field, Revision
 * 2026-10-10): the Søg tab's field. `fill.secondary`, `radius.pill`, 48 high, no border.
 */
export function SearchFieldDiscover({
  value,
  onClear,
  style,
  testID,
  ...props
}: SearchFieldDiscoverProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <View
      testID="search-field-discover"
      style={[styles.field, { backgroundColor: theme.fillSecondary }]}
    >
      <Ionicons name="search" size={18} color={theme.contentMuted} accessibilityElementsHidden />
      <TextInput
        testID={testID}
        style={[typography.body, styles.input, { color: theme.contentPrimary }, style]}
        placeholderTextColor={theme.contentMuted}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        value={value}
        {...props}
      />
      {value && onClear ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ryd søgning"
          onPress={onClear}
          style={styles.clearButton}
        >
          <Ionicons name="close-circle" size={18} color={theme.contentMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm,
    height: 48,
    borderRadius: radius.pill,
    paddingLeft: space.insetMd,
    paddingRight: space.insetSm,
  },
  input: {
    flex: 1,
    paddingVertical: space.insetSm,
  },
  clearButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
