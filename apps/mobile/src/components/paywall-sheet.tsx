import { Ionicons } from "@expo/vector-icons";
import { Linking, StyleSheet, Text, View } from "react-native";
import { Banner, Sheet } from "@/components/catalog-ui";
import { Button, ButtonDock } from "@/components/ui";
import { PAYWALL_BENEFITS, PAYWALL_LEGAL_URLS, type PaywallBody } from "@/premium/plus-view-model";
import { PriceSkeleton } from "@/premium/price-skeleton";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space, type } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type PaywallSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  iapAvailable: boolean;
  webUnavailableMessage: string | null;
  monthPrice: string | null;
  yearPrice: string | null;
  body: PaywallBody;
  /** Shown as a Banner when Start gratis prøve failed. */
  error: string | null;
  onStartTrial: () => void;
  onBuyMonth: () => void;
  onBuyYear: () => void;
  onRestore: () => void;
  busy?: boolean;
};

function openLegalUrl(url: string | null) {
  if (url) {
    void Linking.openURL(url);
  }
}

export function PaywallSheet({
  visible,
  onDismiss,
  iapAvailable,
  webUnavailableMessage,
  monthPrice,
  yearPrice,
  body,
  error,
  onStartTrial,
  onBuyMonth,
  onBuyYear,
  onRestore,
  busy = false,
}: PaywallSheetProps) {
  const theme = useTheme();
  const typography = useTypography();
  const purchaseDisabled = busy || !iapAvailable;

  return (
    <Sheet visible={visible} title="KitCollective+" onDismiss={onDismiss}>
      <View style={styles.body} testID="paywall-sheet">
        {error ? <Banner tone="danger" message={error} /> : null}
        <View style={styles.benefits}>
          {PAYWALL_BENEFITS.map((benefit) => (
            <View key={benefit} style={styles.benefit}>
              <Ionicons
                name="checkmark"
                size={20}
                color={theme.contentPrimary}
                accessibilityElementsHidden
              />
              <Text style={[typography.body, { color: theme.contentPrimary }]}>{benefit}</Text>
            </View>
          ))}
        </View>
        {body.kind === "trial" ? (
          <>
            <View style={[styles.timeline, { backgroundColor: theme.fillSecondary }]}>
              {body.timeline.map((line) => (
                <View key={line.label} style={styles.timelineLine}>
                  <Text
                    style={[typography.mono, styles.timelineLabel, { color: theme.contentPrimary }]}
                  >
                    {line.label}
                  </Text>
                  <Text style={[typography.labelSm, { color: theme.contentPrimary }]}>
                    {line.text}
                  </Text>
                </View>
              ))}
            </View>
            <View testID={iapAvailable ? "paywall-prices" : undefined}>
              {body.priceLine ? (
                <Text style={[typography.labelSm, { color: theme.contentSecondary }]}>
                  {body.priceLine}
                </Text>
              ) : (
                <PriceSkeleton width="80%" height={type.labelSm.lineHeight} />
              )}
            </View>
          </>
        ) : !iapAvailable ? (
          webUnavailableMessage ? (
            <Text style={[typography.body, { color: theme.contentSecondary }]}>
              {webUnavailableMessage}
            </Text>
          ) : null
        ) : (
          <View style={styles.priceRow} testID="paywall-prices">
            <View style={styles.priceColumn}>
              <Text style={[typography.caption, { color: theme.contentSecondary }]}>Månedlig</Text>
              {monthPrice ? (
                <Text style={[typography.mono, { color: theme.contentPrimary }]}>{monthPrice}</Text>
              ) : (
                <PriceSkeleton width={space.insetLg * 3} height={type.mono.lineHeight} />
              )}
            </View>
            <View style={styles.priceColumn}>
              <Text style={[typography.caption, { color: theme.contentSecondary }]}>Årlig</Text>
              {yearPrice ? (
                <Text style={[typography.mono, { color: theme.contentPrimary }]}>{yearPrice}</Text>
              ) : (
                <PriceSkeleton width={space.insetLg * 3} height={type.mono.lineHeight} />
              )}
            </View>
          </View>
        )}
      </View>
      <ButtonDock>
        {body.kind === "trial" ? (
          <Button
            label={body.buttonLabel}
            testID="paywall-start-trial"
            variant="primary"
            width="fill"
            loading={busy}
            onPress={onStartTrial}
          />
        ) : (
          <>
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
          </>
        )}
        <View style={styles.links}>
          <Button
            label="Gendan køb"
            variant="tertiary"
            disabled={purchaseDisabled}
            onPress={onRestore}
          />
          <Button
            label="Vilkår"
            variant="tertiary"
            onPress={() => openLegalUrl(PAYWALL_LEGAL_URLS.terms)}
          />
          <Button
            label="Privatliv"
            variant="tertiary"
            onPress={() => openLegalUrl(PAYWALL_LEGAL_URLS.privacy)}
          />
        </View>
      </ButtonDock>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: space.gapMd,
  },
  benefits: {
    gap: space.gapSm,
  },
  benefit: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm,
  },
  timeline: {
    borderRadius: radius.md,
    padding: space.insetMd,
    gap: space.gapSm,
  },
  timelineLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
  },
  timelineLabel: {
    minWidth: space.insetLg * 3,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: space.gapMd,
  },
  priceColumn: {
    gap: space.gapSm,
  },
  links: {
    flexDirection: "row",
    justifyContent: "center",
    gap: space.gapMd,
  },
});
