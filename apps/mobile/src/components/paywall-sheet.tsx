import { StyleSheet, Text, View } from "react-native";
import { Sheet } from "@/components/catalog-ui";
import { Button, ButtonDock } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type PaywallSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  iapAvailable: boolean;
  webUnavailableMessage: string | null;
  monthPrice: string | null;
  yearPrice: string | null;
  onBuyMonth: () => void;
  onBuyYear: () => void;
  onRestore: () => void;
  busy?: boolean;
};

export function PaywallSheet({
  visible,
  onDismiss,
  iapAvailable,
  webUnavailableMessage,
  monthPrice,
  yearPrice,
  onBuyMonth,
  onBuyYear,
  onRestore,
  busy = false,
}: PaywallSheetProps) {
  const theme = useTheme();
  const typography = useTypography();
  const purchaseDisabled = busy || !iapAvailable;

  return (
    <Sheet visible={visible} title="Premium" onDismiss={onDismiss}>
      <View style={styles.body}>
        <Text style={[typography.body, { color: theme.contentSecondary }]}>
          Få adgang til ønskeliste og premium-funktioner.
        </Text>
        {!iapAvailable && webUnavailableMessage ? (
          <Text style={[typography.body, { color: theme.contentSecondary }]}>
            {webUnavailableMessage}
          </Text>
        ) : null}
        {iapAvailable ? (
          <View style={styles.priceRow}>
            <View style={styles.priceColumn}>
              <Text style={[typography.caption, { color: theme.contentSecondary }]}>Månedlig</Text>
              <Text style={[typography.mono, { color: theme.contentPrimary }]}>
                {monthPrice ?? "…"}
              </Text>
            </View>
            <View style={styles.priceColumn}>
              <Text style={[typography.caption, { color: theme.contentSecondary }]}>Årlig</Text>
              <Text style={[typography.mono, { color: theme.contentPrimary }]}>
                {yearPrice ?? "…"}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
      <ButtonDock>
        <Button
          label="Månedlig"
          variant="primary"
          width="fill"
          disabled={purchaseDisabled}
          loading={busy}
          onPress={onBuyMonth}
        />
        <Button
          label="Årlig"
          variant="secondary"
          width="fill"
          disabled={purchaseDisabled}
          loading={busy}
          onPress={onBuyYear}
        />
        <Button
          label="Gendan køb"
          variant="tertiary"
          width="fill"
          disabled={purchaseDisabled}
          loading={busy}
          onPress={onRestore}
        />
      </ButtonDock>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: space.gapMd,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: space.gapMd,
  },
  priceColumn: {
    gap: space.gapSm,
  },
});
