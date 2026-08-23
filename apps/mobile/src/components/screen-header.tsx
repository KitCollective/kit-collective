import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space, type } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type ScreenHeaderProps = {
  title: string;
  trailing?: ReactNode;
};

export function ScreenHeader({ title, trailing }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  return (
    <View style={[styles.container, { paddingTop: insets.top + space.insetSm }]}>
      <Text style={[styles.title, { color: theme.contentPrimary }]}>{title}</Text>
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
    paddingBottom: space.insetMd,
    minHeight: 52,
  },
  title: {
    fontFamily: type.title.fontFamily,
    fontSize: type.title.fontSize,
    lineHeight: type.title.lineHeight,
    letterSpacing: type.title.letterSpacing,
    flex: 1,
  },
});
