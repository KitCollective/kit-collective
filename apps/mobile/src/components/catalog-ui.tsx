import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { IconButton } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import type { ThemeColors } from "@/theme/tokens";
import { radius, space } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

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

type SheetVariant = "form" | "door";

type SheetProps = {
  visible: boolean;
  title: string;
  onDismiss: () => void;
  children: ReactNode;
  variant?: SheetVariant;
  sentence?: string;
  leading?: ReactNode;
};

export function Sheet({
  visible,
  title,
  onDismiss,
  children,
  variant = "form",
  sentence,
  leading,
}: SheetProps) {
  const theme = useTheme();
  const typography = useTypography();
  const reduceMotion = useReduceMotion();
  const isDoor = variant === "door";

  return (
    <Modal
      animationType={reduceMotion ? "none" : "slide"}
      transparent
      visible={visible}
      onRequestClose={onDismiss}
    >
      <Pressable
        style={[styles.sheetScrim, { backgroundColor: theme.scrim }]}
        onPress={onDismiss}
        accessibilityLabel="Luk"
      />
      <View style={[styles.sheet, { backgroundColor: theme.surfaceRaised }]}>
        {isDoor ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.sheetHandle, { backgroundColor: theme.borderSubtle }]}
          />
        ) : null}
        <View style={[styles.sheetHeader, isDoor && styles.sheetHeaderDoor]}>
          {leading}
          <Text
            accessibilityRole="header"
            style={[typography.title, styles.sheetTitle, { color: theme.contentPrimary }]}
          >
            {title}
          </Text>
          {isDoor ? null : <IconButton name="Luk" icon="close" onPress={onDismiss} />}
        </View>
        {isDoor && sentence ? (
          <Text style={[typography.body, styles.sheetSentence, { color: theme.contentSecondary }]}>
            {sentence}
          </Text>
        ) : null}
        <View style={styles.sheetBody}>{children}</View>
      </View>
    </Modal>
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
  sheetScrim: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: space.insetLg,
    maxHeight: "80%",
  },
  sheetHandle: {
    alignSelf: "center",
    width: space.insetLg,
    height: space.insetSm,
    borderRadius: radius.pill,
    marginTop: space.insetMd,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.insetLg,
    paddingTop: space.insetLg,
    paddingBottom: space.insetMd,
    gap: space.gapSm,
  },
  sheetHeaderDoor: {
    paddingTop: space.insetMd,
  },
  sheetTitle: {
    flex: 1,
  },
  sheetSentence: {
    paddingHorizontal: space.insetLg,
    paddingBottom: space.insetMd,
  },
  sheetBody: {
    paddingHorizontal: space.insetLg,
    gap: space.gapMd,
  },
  banner: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.insetMd,
    gap: space.gapSm,
  },
});
