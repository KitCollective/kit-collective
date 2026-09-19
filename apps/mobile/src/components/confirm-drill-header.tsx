import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type ConfirmDrillHeaderProps = {
  title: string;
  onBack: () => void;
};

export function ConfirmDrillHeader({ title, onBack }: ConfirmDrillHeaderProps) {
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + space.insetSm,
          borderBottomColor: theme.borderSubtle,
        },
      ]}
    >
      <IconButton name="Tilbage" icon="chevron-back" onPress={onBack} />
      <Text style={[typography.title, styles.title, { color: theme.contentPrimary }]}>{title}</Text>
      <View style={styles.trailingSpacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.insetSm,
    paddingBottom: space.insetSm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    flex: 1,
    textAlign: "center",
  },
  trailingSpacer: {
    width: 44,
    height: 44,
  },
});
