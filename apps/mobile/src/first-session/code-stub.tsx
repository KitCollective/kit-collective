import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CODE_STUB_BACK_LABEL, CODE_STUB_TITLE } from "@/first-session/door-copy";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

/** Placeholder for the e-mail code step (KIT-275 replaces it). */
export function CodeStub({ onBack }: { onBack: () => void }) {
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();

  return (
    <View
      testID="code-stub"
      style={[
        styles.root,
        { backgroundColor: theme.canvas, paddingTop: insets.top + space.insetMd },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={CODE_STUB_BACK_LABEL}
        testID="code-stub-back"
        onPress={onBack}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
      >
        <Text style={[typography.label, { color: theme.contentPrimary }]}>
          {CODE_STUB_BACK_LABEL}
        </Text>
      </Pressable>
      <Text accessibilityRole="header" style={[typography.title, { color: theme.contentPrimary }]}>
        {CODE_STUB_TITLE}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: space.insetLg,
    gap: space.gapMd,
  },
  back: {
    minHeight: 44,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  pressed: {
    opacity: 0.9,
  },
});
