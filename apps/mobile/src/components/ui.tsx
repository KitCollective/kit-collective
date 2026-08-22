import { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from "react-native";
import { color, radius, space, type } from "@/theme/tokens";

type ButtonProps = PressableProps & {
  label: string;
  loading?: boolean;
};

export function PrimaryButton({ label, loading = false, disabled, ...props }: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        isDisabled && styles.buttonDisabled,
        pressed && !isDisabled && styles.buttonPressed,
      ]}
      disabled={isDisabled}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={color.contentInverse} />
      ) : (
        <Text style={styles.buttonLabel}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Screen({ children }: { children: ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <Text style={styles.error}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.canvas,
    paddingHorizontal: space.insetLg,
    paddingTop: space.xl,
  },
  button: {
    minHeight: 44,
    borderRadius: radius.pill,
    backgroundColor: color.fillPrimary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.insetMd,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonLabel: {
    color: color.contentInverse,
    fontSize: type.label.fontSize,
    fontWeight: type.label.fontWeight,
    lineHeight: type.label.lineHeight,
  },
  label: {
    color: color.contentPrimary,
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    marginBottom: space.xs,
    fontWeight: type.label.fontWeight,
  },
  error: {
    color: color.danger,
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    marginTop: space.gapSm,
  },
});
