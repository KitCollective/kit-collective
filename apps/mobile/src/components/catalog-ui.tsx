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
import { color, radius, space, type } from "@/theme/tokens";

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
  const dimension = size === "sm" ? 24 : 32;
  const letters = monogramFromLabel(label);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.mark, { width: dimension, height: dimension, borderRadius: radius.sm }]}
    >
      <Text style={[styles.markText, size === "sm" && styles.markTextSm]}>{letters}</Text>
    </View>
  );
}

type SearchFieldProps = TextInputProps & {
  onClear?: () => void;
};

export function SearchField({ value, onClear, style, ...props }: SearchFieldProps) {
  return (
    <View style={styles.searchField}>
      <Ionicons name="search" size={18} color={color.contentMuted} accessibilityElementsHidden />
      <TextInput
        style={[styles.searchInput, style]}
        placeholderTextColor={color.contentMuted}
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
          <Ionicons name="close-circle" size={18} color={color.contentMuted} />
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
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.listRow,
        pressed && styles.listRowPressed,
        selected && styles.listRowSelected,
      ]}
    >
      <Mark label={title} />
      <View style={styles.listRowBody}>
        <Text style={styles.listRowTitle}>{title}</Text>
        {meta ? <Text style={styles.listRowMeta}>{meta}</Text> : null}
      </View>
      {selected ? (
        <Ionicons name="checkmark" size={20} color={color.contentPrimary} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={color.contentMuted} />
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
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onDismiss}>
      <Pressable style={styles.sheetScrim} onPress={onDismiss} accessibilityLabel="Luk" />
      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Luk"
            hitSlop={8}
            onPress={onDismiss}
          >
            <Ionicons name="close" size={24} color={color.contentPrimary} />
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

// warning/success surface tokens are unmapped in docs/design-system.md — use neutral
// surfaces until semantic aliases exist (see KIT-24 Linear comment).
const bannerToneStyles: Record<BannerTone, { background: string; border: string }> = {
  danger: { background: color.fillSecondary, border: color.danger },
  warning: { background: color.fillSecondary, border: color.borderSubtle },
  info: { background: color.fillSecondary, border: color.borderSubtle },
  success: { background: color.fillSecondary, border: color.borderSubtle },
};

export function Banner({ tone, message, action }: BannerProps) {
  const toneStyle = bannerToneStyles[tone];

  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: toneStyle.background, borderColor: toneStyle.border },
      ]}
      accessibilityRole="alert"
    >
      <Text style={styles.bannerMessage}>{message}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    backgroundColor: color.fillSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  markText: {
    fontSize: type.caption.fontSize,
    fontWeight: type.label.fontWeight,
    color: color.contentPrimary,
  },
  markTextSm: {
    fontSize: 10,
  },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm,
    minHeight: 44,
    borderWidth: 1,
    borderColor: color.borderSubtle,
    borderRadius: radius.pill,
    paddingHorizontal: space.insetMd,
    backgroundColor: color.surface,
  },
  searchInput: {
    flex: 1,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    color: color.contentPrimary,
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
  listRowPressed: {
    backgroundColor: color.fillSecondary,
  },
  listRowSelected: {
    backgroundColor: color.fillSecondary,
  },
  listRowBody: {
    flex: 1,
    gap: 2,
  },
  listRowTitle: {
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    color: color.contentPrimary,
  },
  listRowMeta: {
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    color: color.contentMuted,
  },
  sheetScrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    backgroundColor: color.surface,
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
    fontSize: type.title.fontSize,
    lineHeight: type.title.lineHeight,
    fontWeight: type.title.fontWeight,
    color: color.contentPrimary,
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
    color: color.contentPrimary,
  },
});
