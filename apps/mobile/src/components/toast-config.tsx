import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ToastConfig, ToastConfigParams } from "react-native-toast-message";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

/**
 * Custom props threaded through `Toast.show({ props })` for the danger toast.
 * `onRetry` powers the **Prøv igen** action.
 */
export type DangerToastProps = {
  onRetry?: () => void;
};

/**
 * Danger toast body. We adopted `react-native-toast-message` (standard library) for
 * runtime reliability in Expo Go — see docs/design-system.md → Toast. The chrome still
 * borrows the app's danger/surface/content Banner tokens so it reads as ours, rather
 * than the library's stock look.
 */
function DangerToast({ text1, props, hide }: ToastConfigParams<DangerToastProps>) {
  const theme = useTheme();
  const typography = useTypography();
  const onRetry = props?.onRetry;

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.card,
        {
          backgroundColor: theme.fillSecondary,
          borderColor: theme.danger,
          shadowColor: theme.contentPrimary,
        },
      ]}
    >
      <Ionicons
        name="alert-circle"
        size={20}
        color={theme.danger}
        importantForAccessibility="no-hide-descendants"
      />
      <Text
        style={[typography.body, styles.message, { color: theme.contentPrimary }]}
        numberOfLines={2}
      >
        {text1}
      </Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Prøv igen"
          hitSlop={8}
          onPress={() => {
            onRetry();
            hide();
          }}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
        >
          <Text style={[typography.label, { color: theme.danger }]}>Prøv igen</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Toast layouts for custom types. Mount on the root `<Toast config={toastConfig} />`. */
export const toastConfig: ToastConfig = {
  error: (params) => <DangerToast {...(params as ToastConfigParams<DangerToastProps>)} />,
};

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm,
    width: "90%",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.insetMd,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  message: {
    flex: 1,
  },
  action: {
    paddingHorizontal: space.insetSm,
    paddingVertical: 4,
  },
  actionPressed: {
    opacity: 0.6,
  },
});
