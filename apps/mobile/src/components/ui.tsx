import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { color, radius, space, type } from "@/theme/tokens";

type ButtonVariant = "primary" | "secondary" | "tertiary" | "destructive";

type ButtonProps = PressableProps & {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
};

export function Button({
  label,
  variant = "primary",
  loading = false,
  disabled,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
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
  base: {
    minHeight: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.insetMd,
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
