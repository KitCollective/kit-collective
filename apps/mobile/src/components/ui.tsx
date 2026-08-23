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
import { space, type } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

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
  iconColor,
  iconSize = 24,
  disabled,
  ...props
}: IconButtonProps) {
  const theme = useTheme();
  const resolvedIconColor = iconColor ?? theme.contentPrimary;
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
      <Ionicons name={icon} size={iconSize} color={resolvedIconColor} accessibilityElementsHidden />
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
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const variantStyle = getVariantStyles(theme)[variant];
  const labelStyle = getLabelStyles(theme)[variant];

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        buttonLayoutStyles(width),
        variantStyle,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
      disabled={isDisabled}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={getLoadingColor(theme, variant)} />
      ) : (
        <Text style={[styles.label, labelStyle]}>{label}</Text>
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
  const theme = useTheme();

  return (
    <View
      style={[
        styles.dock,
        {
          paddingBottom: Math.max(insets.bottom, space.insetMd),
          borderTopColor: theme.borderSubtle,
          backgroundColor: theme.canvas,
        },
      ]}
    >
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
  const theme = useTheme();

  return (
    <View style={styles.emptyState}>
      <Text style={[styles.emptyTitle, { color: theme.contentPrimary }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: theme.contentMuted }]}>{body}</Text>
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
    fontFamily: type.label.fontFamily,
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
  },
  dock: {
    paddingHorizontal: space.insetLg,
    paddingTop: space.insetMd,
    gap: space.gapMd,
    borderTopWidth: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.gapMd,
    paddingHorizontal: space.insetLg,
  },
  emptyTitle: {
    fontFamily: type.section.fontFamily,
    fontSize: type.section.fontSize,
    lineHeight: type.section.lineHeight,
    letterSpacing: type.section.letterSpacing,
    textAlign: "center",
  },
  emptyBody: {
    fontFamily: type.body.fontFamily,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    textAlign: "center",
    marginBottom: space.insetMd,
  },
});

function getVariantStyles(theme: ReturnType<typeof useTheme>) {
  return {
    primary: {
      backgroundColor: theme.fillPrimary,
    },
    secondary: {
      backgroundColor: theme.fillSecondary,
      borderWidth: 1,
      borderColor: theme.borderSubtle,
    },
    tertiary: {
      backgroundColor: "transparent",
    },
    destructive: {
      backgroundColor: theme.danger,
    },
  } as const;
}

function getLabelStyles(theme: ReturnType<typeof useTheme>) {
  return {
    primary: {
      color: theme.contentInverse,
    },
    secondary: {
      color: theme.contentPrimary,
    },
    tertiary: {
      color: theme.contentPrimary,
    },
    destructive: {
      color: theme.contentInverse,
    },
  } as const;
}

function getLoadingColor(theme: ReturnType<typeof useTheme>, variant: ButtonVariant): string {
  switch (variant) {
    case "primary":
    case "destructive":
      return theme.contentInverse;
    case "secondary":
    case "tertiary":
      return theme.contentPrimary;
    default: {
      const _exhaustive: never = variant;
      return _exhaustive;
    }
  }
}
