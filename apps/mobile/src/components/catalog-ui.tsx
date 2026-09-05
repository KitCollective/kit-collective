import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, type TextInputProps, View } from "react-native";
import { useTypography } from "@/theme/brand-fonts";
import type { ThemeColors } from "@/theme/tokens";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export { Sheet, useSheetScroll } from "@/components/sheet";

type MarkProps = {
  label: string;
  size?: "sm" | "md";
};

function monogramFromLabel(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
  }

  return label.trim().slice(0, 2).toUpperCase();
}

export function Mark({ label, size = "md" }: MarkProps) {
  const theme = useTheme();
  const typography = useTypography();
  const dimension = size === "sm" ? 24 : 32;
  const letters = monogramFromLabel(label);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.mark,
        {
          width: dimension,
          height: dimension,
          borderRadius: radius.sm,
          backgroundColor: theme.fillSecondary,
        },
      ]}
    >
      <Text style={[typography.caption, { color: theme.contentPrimary }]}>{letters}</Text>
    </View>
  );
}

type SearchFieldVariant = "collection" | "catalog" | "city" | "admin";

type SearchFieldProps = TextInputProps & {
  variant: SearchFieldVariant;
  onClear?: () => void;
};

export function SearchField({ variant, value, onClear, style, ...props }: SearchFieldProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <View
      testID={`search-field-${variant}`}
      style={[
        styles.searchField,
        {
          borderColor: theme.borderSubtle,
          backgroundColor: theme.surface,
        },
      ]}
    >
      <Ionicons name="search" size={18} color={theme.contentMuted} accessibilityElementsHidden />
      <TextInput
        style={[typography.body, styles.searchInput, { color: theme.contentPrimary }, style]}
        placeholderTextColor={theme.contentMuted}
        autoCorrect={false}
        autoCapitalize="none"
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

type ListRowProps = {
  title: string;
  meta?: string;
  selected?: boolean;
  onPress: () => void;
};

type SelectFieldProps = {
  value?: string | null;
  placeholder: string;
  onPress: () => void;
  disabled?: boolean;
};

export function SelectField({ value, placeholder, onPress, disabled }: SelectFieldProps) {
  const theme = useTheme();
  const typography = useTypography();
  const displayValue = value ?? placeholder;
  const isEmpty = !value;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isEmpty ? `${placeholder} ikke valgt` : displayValue}
      accessibilityState={{ disabled: disabled ?? false }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.selectField,
        {
          borderColor: theme.borderSubtle,
          backgroundColor: theme.surface,
        },
        pressed && !disabled && { backgroundColor: theme.fillSecondary },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text
        style={[
          typography.body,
          { color: isEmpty ? theme.contentMuted : theme.contentPrimary, flex: 1 },
        ]}
      >
        {displayValue}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={theme.contentMuted} />
    </Pressable>
  );
}

export function ListRow({ title, meta, selected, onPress }: ListRowProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.listRow,
        pressed && { backgroundColor: theme.fillSecondary },
        selected && { backgroundColor: theme.fillSecondary },
      ]}
    >
      <Mark label={title} />
      <View style={styles.listRowBody}>
        <Text style={[typography.body, { color: theme.contentPrimary }]}>{title}</Text>
        {meta ? (
          <Text style={[typography.caption, { color: theme.contentMuted }]}>{meta}</Text>
        ) : null}
      </View>
      {selected ? (
        <Ionicons name="checkmark" size={20} color={theme.contentPrimary} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={theme.contentMuted} />
      )}
    </Pressable>
  );
}

type BannerTone = "danger" | "warning" | "info" | "success";

type BannerProps = {
  tone: BannerTone;
  message: string;
  action?: ReactNode;
};

function getBannerToneStyles(
  theme: ThemeColors,
  tone: BannerTone,
): { background: string; border: string } {
  const background = theme.fillSecondary;
  switch (tone) {
    case "danger":
      return { background, border: theme.danger };
    case "warning":
      return { background, border: theme.warning };
    case "info":
      return { background, border: theme.info };
    case "success":
      return { background, border: theme.success };
    default: {
      const _exhaustive: never = tone;
      return _exhaustive;
    }
  }
}

export function Banner({ tone, message, action }: BannerProps) {
  const theme = useTheme();
  const typography = useTypography();
  const toneStyle = getBannerToneStyles(theme, tone);

  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: toneStyle.background, borderColor: toneStyle.border },
      ]}
      accessibilityRole="alert"
    >
      <Text style={[typography.body, { color: theme.contentPrimary }]}>{message}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    alignItems: "center",
    justifyContent: "center",
  },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.insetMd,
  },
  searchInput: {
    flex: 1,
    paddingVertical: space.insetSm,
  },
  clearButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
    minHeight: 44,
    paddingVertical: space.insetSm,
    paddingHorizontal: space.insetSm,
    borderRadius: radius.md,
  },
  listRowBody: {
    flex: 1,
    gap: 2,
  },
  selectField: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
    minHeight: 52,
    paddingHorizontal: space.insetMd,
    paddingVertical: space.insetSm,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  banner: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.insetMd,
    gap: space.gapSm,
  },
});
