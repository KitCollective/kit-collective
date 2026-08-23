import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { radius, space, type } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";
import type { ThemeColors } from "@/theme/tokens";

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
      <Text style={[styles.markText, { color: theme.contentPrimary }]}>{letters}</Text>
    </View>
  );
}

type SearchFieldVariant = "collection" | "catalog" | "admin";

type SearchFieldProps = TextInputProps & {
  variant: SearchFieldVariant;
  onClear?: () => void;
};

export function SearchField({ variant, value, onClear, style, ...props }: SearchFieldProps) {
  const theme = useTheme();

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
        style={[styles.searchInput, { color: theme.contentPrimary }, style]}
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
          hitSlop={8}
          onPress={onClear}
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

export function ListRow({ title, meta, selected, onPress }: ListRowProps) {
  const theme = useTheme();

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
        <Text style={[styles.listRowTitle, { color: theme.contentPrimary }]}>{title}</Text>
        {meta ? (
          <Text style={[styles.listRowMeta, { color: theme.contentMuted }]}>{meta}</Text>
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

type SheetProps = {
  visible: boolean;
  title: string;
  onDismiss: () => void;
  children: ReactNode;
};

export function Sheet({ visible, title, onDismiss, children }: SheetProps) {
  const theme = useTheme();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

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
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: theme.contentPrimary }]}>{title}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Luk"
            hitSlop={8}
            onPress={onDismiss}
          >
            <Ionicons name="close" size={24} color={theme.contentPrimary} />
          </Pressable>
        </View>
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
  const toneStyle = getBannerToneStyles(theme, tone);

  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: toneStyle.background, borderColor: toneStyle.border },
      ]}
      accessibilityRole="alert"
    >
      <Text style={[styles.bannerMessage, { color: theme.contentPrimary }]}>{message}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    alignItems: "center",
    justifyContent: "center",
  },
  markText: {
    fontFamily: type.label.fontFamily,
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
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
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    paddingVertical: space.insetSm,
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
  listRowTitle: {
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  listRowMeta: {
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
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
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.insetLg,
    paddingTop: space.insetLg,
    paddingBottom: space.insetMd,
  },
  sheetTitle: {
    fontFamily: type.title.fontFamily,
    fontSize: type.title.fontSize,
    lineHeight: type.title.lineHeight,
    letterSpacing: type.title.letterSpacing,
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
  bannerMessage: {
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
});
