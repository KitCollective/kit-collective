import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type ButtonWidth, buttonLayoutStyles } from "@/components/button-layout";
import { color, space, type } from "@/theme/tokens";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

type IconButtonProps = Omit<PressableProps, "children"> & {
  name: string;
  icon: IoniconName;
  iconColor?: string;
  iconSize?: number;
};

/**
 * Icon button primitive (docs/design-system.md → Components → Icon button).
 * Single icon, no caption inside the control; accessible name via `name`.
 */
export function IconButton({
  name,
  icon,
  iconColor = color.contentPrimary,
  iconSize = 24,
  disabled,
  ...props
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      disabled={disabled}
      style={({ pressed }) => [
        styles.iconButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
      {...props}
    >
      <Ionicons name={icon} size={iconSize} color={iconColor} accessibilityElementsHidden />
    </Pressable>
  );
}

type ButtonVariant = "primary" | "secondary" | "tertiary" | "destructive";

type ButtonProps = PressableProps & {
  label: string;
  variant?: ButtonVariant;
  width?: ButtonWidth;
  loading?: boolean;
};

export function Button({
  label,
  variant = "primary",
  width = "hug",
  loading = false,
  disabled,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        buttonLayoutStyles(width),
        variantStyles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
      disabled={isDisabled}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={loadingColor[variant]} />
      ) : (
        <Text style={[styles.label, labelStyles[variant]]}>{label}</Text>
      )}
    </Pressable>
  );
}

type ButtonDockProps = {
  children: ReactNode;
};

/**
 * Bottom-pinned footer actions region (docs/design-system.md → Layout → Footer actions).
 * Stacks fill primaries and tertiary paths vertically; safe-area aware.
 */
export function ButtonDock({ children }: ButtonDockProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, space.insetMd) }]}>
      {children}
    </View>
  );
}

type EmptyStateProps = {
  title: string;
  body: string;
  action?: ReactNode;
};

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.9,
  },
  label: {
    fontSize: type.label.fontSize,
    fontWeight: type.label.fontWeight,
    lineHeight: type.label.lineHeight,
  },
  dock: {
    paddingHorizontal: space.insetLg,
    paddingTop: space.insetMd,
    gap: space.gapMd,
    borderTopWidth: 1,
    borderTopColor: color.borderSubtle,
    backgroundColor: color.canvas,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.gapMd,
    paddingHorizontal: space.insetLg,
  },
  emptyTitle: {
    fontSize: type.title.fontSize,
    lineHeight: type.title.lineHeight,
    fontWeight: type.title.fontWeight,
    color: color.contentPrimary,
    textAlign: "center",
  },
  emptyBody: {
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    color: color.contentMuted,
    textAlign: "center",
    marginBottom: space.insetMd,
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: color.fillPrimary,
  },
  secondary: {
    backgroundColor: color.fillSecondary,
    borderWidth: 1,
    borderColor: color.borderSubtle,
  },
  tertiary: {
    backgroundColor: "transparent",
  },
  destructive: {
    backgroundColor: color.danger,
  },
});

const labelStyles = StyleSheet.create({
  primary: {
    color: color.contentInverse,
  },
  secondary: {
    color: color.contentPrimary,
  },
  tertiary: {
    color: color.contentPrimary,
  },
  destructive: {
    color: color.contentInverse,
  },
});

const loadingColor: Record<ButtonVariant, string> = {
  primary: color.contentInverse,
  secondary: color.contentPrimary,
  tertiary: color.contentPrimary,
  destructive: color.contentInverse,
};
