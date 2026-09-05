import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
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
import { useTypography } from "@/theme/brand-fonts";
import { space, type, withAlpha } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";
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
  const typography = useTypography();
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
        <Text style={[typography.label, labelStyle]}>{label}</Text>
      )}
    </Pressable>
  );
}

type ButtonDockVariant = "border" | "fade";

type ButtonDockProps = {
  children: ReactNode;
  variant?: ButtonDockVariant;
};

/** Top gradient+blur zone for the fade dock variant. */
export const BUTTON_DOCK_FADE_SCRIM_HEIGHT = space.insetLg * 2;

/** Scroll clearance for fade overlay: scrim + dock chrome (helper + gap + fill button). Add safe-area bottom. */
export const BUTTON_DOCK_FADE_SCROLL_PADDING =
  BUTTON_DOCK_FADE_SCRIM_HEIGHT + space.insetMd + type.caption.lineHeight + space.gapMd + 48;

const FADE_GRADIENT_STOPS = [0, 0.25, 0.5, 0.75, 1] as const;

/**
 * Bottom-pinned footer actions region (docs/design-system.md → Layout → Footer actions).
 * Stacks fill primaries and tertiary paths vertically; safe-area aware.
 */
export function ButtonDock({ children, variant = "border" }: ButtonDockProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const bottomPadding = Math.max(insets.bottom, space.insetMd);

  if (variant === "fade") {
    return (
      <View style={styles.dockFadeRoot} pointerEvents="box-none">
        <View
          style={[styles.fadeScrim, { height: BUTTON_DOCK_FADE_SCRIM_HEIGHT }]}
          pointerEvents="none"
        >
          {!reduceMotion ? (
            <BlurView intensity={24} tint="default" style={StyleSheet.absoluteFill} />
          ) : null}
          <View style={styles.fadeGradient}>
            {FADE_GRADIENT_STOPS.map((alpha) => (
              <View
                key={alpha}
                style={[
                  styles.fadeGradientBand,
                  { backgroundColor: withAlpha(theme.canvas, alpha) },
                ]}
              />
            ))}
          </View>
        </View>
        <View
          style={[
            styles.dockContent,
            {
              paddingBottom: bottomPadding,
              backgroundColor: theme.canvas,
            },
          ]}
        >
          {children}
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.dock,
        styles.dockBorder,
        {
          paddingBottom: bottomPadding,
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
  body?: string;
  diagram?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ title, body, diagram, action }: EmptyStateProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <View style={styles.emptyState}>
      {diagram}
      <Text style={[typography.section, { color: theme.contentPrimary, textAlign: "center" }]}>
        {title}
      </Text>
      {body ? (
        <Text style={[typography.body, { color: theme.contentMuted, textAlign: "center" }]}>
          {body}
        </Text>
      ) : null}
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
  dock: {
    paddingHorizontal: space.insetLg,
    paddingTop: space.insetMd,
    gap: space.gapMd,
  },
  dockBorder: {
    borderTopWidth: 1,
  },
  dockFadeRoot: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  dockContent: {
    paddingHorizontal: space.insetLg,
    paddingTop: space.insetMd,
    gap: space.gapMd,
  },
  fadeScrim: {
    width: "100%",
    overflow: "hidden",
  },
  fadeGradient: {
    ...StyleSheet.absoluteFill,
  },
  fadeGradientBand: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.gapMd,
    paddingHorizontal: space.insetLg,
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
