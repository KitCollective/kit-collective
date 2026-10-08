import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useStableSafeAreaInsets } from "@/theme/use-stable-safe-area-insets";
import { useTheme } from "@/theme/use-theme";

type ScreenHeaderProps = {
  title: string;
  trailing?: ReactNode;
};

export function ScreenHeader({ title, trailing }: ScreenHeaderProps) {
  const insets = useStableSafeAreaInsets();
  const theme = useTheme();
  const typography = useTypography();

  return (
    <View style={[styles.container, { paddingTop: insets.top + space.insetSm }]}>
      {/* One recurring overview title: `display` (28), matching Samling. */}
      <Text style={[typography.display, styles.title, { color: theme.contentPrimary }]}>
        {title}
      </Text>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.insetMd,
    paddingBottom: space.insetSm,
    minHeight: 52,
  },
  title: {
    flex: 1,
  },
});
