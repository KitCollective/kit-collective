import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, type TextInputProps, View } from "react-native";
import { IconButton } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type SearchFieldDiscoverProps = TextInputProps & {
  /** Required: the placeholder is not a label substitute. */
  accessibilityLabel: string;
  onClear?: () => void;
  /** Runs after Back has blurred and cleared the field. */
  onBack?: () => void;
};

/**
 * Search field, `discover` variant (docs/design-system.md → Search field, Revision
 * 2026-10-10): the Søg tab's field. `fill.secondary`, `radius.pill`, 48 high, no border.
 * In focus, Back (Tilbage) replaces the search icon: it blurs and clears the field.
 */
export function SearchFieldDiscover({
  value,
  onClear,
  onBack,
  onFocus,
  onBlur,
  style,
  testID,
  ...props
}: SearchFieldDiscoverProps) {
  const theme = useTheme();
  const typography = useTypography();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  // The lock shows Back in focus and from the first character, so a blurred field that
  // still holds a query keeps it.
  const showBack = focused || Boolean(value);

  const handleBack = () => {
    inputRef.current?.blur();
    onClear?.();
    onBack?.();
  };

  return (
    <View
      testID="search-field-discover"
      style={[
        styles.field,
        { backgroundColor: theme.fillSecondary },
        showBack && styles.fieldFocused,
      ]}
    >
      {showBack ? (
        <IconButton
          testID="search-back"
          name="Tilbage"
          icon="arrow-back"
          iconColor={theme.contentMuted}
          onPress={handleBack}
        />
      ) : (
        <Ionicons name="search" size={18} color={theme.contentMuted} accessibilityElementsHidden />
      )}
      <TextInput
        ref={inputRef}
        testID={testID}
        style={[typography.body, styles.input, { color: theme.contentPrimary }, style]}
        placeholderTextColor={theme.contentMuted}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        value={value}
        {...props}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
      />
      {value && onClear ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ryd søgning"
          testID="search-clear"
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
  // The 44 Back button carries its own inset; the glyph sits a few points right of the search icon.
  fieldFocused: {
    paddingLeft: space.insetSm,
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
