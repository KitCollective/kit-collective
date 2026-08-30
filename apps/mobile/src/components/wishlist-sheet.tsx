import { StyleSheet, Text, View } from "react-native";
import { Sheet } from "@/components/catalog-ui";
import { EmptyState } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type WishlistSheetProps = {
  visible: boolean;
  onDismiss: () => void;
};

export function WishlistSheet({ visible, onDismiss }: WishlistSheetProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <Sheet visible={visible} title="Ønske" onDismiss={onDismiss}>
      <View style={styles.body}>
        <EmptyState title="Ingen ønsker endnu" body="Din ønskeliste er tom i denne version." />
        <Text style={[typography.caption, styles.helper, { color: theme.contentMuted }]}>
          Match og premium-funktioner kommer senere.
        </Text>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: space.gapMd,
  },
  helper: {
    textAlign: "center",
  },
});
