import { StyleSheet, Text, View } from "react-native";
import { Sheet } from "@/components/catalog-ui";
import { Button } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type PaywallSheetProps = {
  visible: boolean;
  onDismiss: () => void;
};

export function PaywallSheet({ visible, onDismiss }: PaywallSheetProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <Sheet visible={visible} title="Premium" onDismiss={onDismiss}>
      <View style={styles.body}>
        <Text style={[typography.body, { color: theme.contentSecondary }]}>
          Få adgang til ønskeliste og premium-funktioner.
        </Text>
        <Button label="Månedlig" variant="primary" width="fill" disabled onPress={() => {}} />
        <Button label="Årlig" variant="secondary" width="fill" disabled onPress={() => {}} />
        <Button label="Gendan køb" variant="secondary" width="fill" disabled onPress={() => {}} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: space.gapMd,
  },
});
