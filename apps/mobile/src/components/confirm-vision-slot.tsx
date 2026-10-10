import { Animated, StyleSheet, View } from "react-native";
import { formatCatalogMissBannerMessage } from "@/capture/catalogMissHint";
import { Banner } from "@/components/catalog-ui";
import { Button } from "@/components/ui";
import { space } from "@/theme/tokens";

type ConfirmVisionSlotProps = {
  groupingMessage?: string | null;
  catalogMiss?: boolean;
  catalogMissHint?: string | null;
  suggestionOpacity: Animated.Value;
  onApplySuggestion: () => void;
  onDismissSuggestion: () => void;
};

/**
 * What is left of the Vision slot after the Identity block took over the identity result
 * (design lock: Confirm and Save, Revision 2026-10-09): the single-jersey grouping suggestion
 * strip and the catalog-miss note. Renders nothing otherwise; there is no status banner.
 */
export function ConfirmVisionSlot({
  groupingMessage,
  catalogMiss = false,
  catalogMissHint = null,
  suggestionOpacity,
  onApplySuggestion,
  onDismissSuggestion,
}: ConfirmVisionSlotProps) {
  if (groupingMessage) {
    return (
      <Animated.View style={{ opacity: suggestionOpacity }}>
        <Banner
          tone="info"
          message={`Forslag: ${groupingMessage}`}
          action={
            <View style={styles.actions}>
              <Button label="Brug" variant="tertiary" onPress={() => void onApplySuggestion()} />
              <Button label="Luk" variant="tertiary" onPress={onDismissSuggestion} />
            </View>
          }
        />
      </Animated.View>
    );
  }

  if (catalogMiss) {
    return (
      <Banner
        tone="info"
        message={formatCatalogMissBannerMessage(catalogMissHint)}
        action={<Button label="Opgrader (kommer snart)" variant="tertiary" disabled />}
      />
    );
  }

  return null;
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    gap: space.gapSm,
  },
});
