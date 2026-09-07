import type { VisionJobResponse } from "@kit/api-contract";
import { KIT_TYPE_LABELS_DA } from "@kit/domain";
import { Animated, StyleSheet, View } from "react-native";
import type { ConfirmVisionBannerState } from "@/capture/confirmVisionBanner";
import { Banner } from "@/components/catalog-ui";
import { ConfirmVisionBanner } from "@/components/confirm-vision-banner";
import { Button } from "@/components/ui";
import { space } from "@/theme/tokens";

type ConfirmVisionSlotProps = {
  bannerState: ConfirmVisionBannerState;
  suggestion: VisionJobResponse | null;
  groupingMessage?: string | null;
  catalogMiss?: boolean;
  suggestionOpacity: Animated.Value;
  onApplySuggestion: () => void;
  onDismissSuggestion: () => void;
};

/** Renders the single Vision slot below Confirm's photo sandbox. */
export function ConfirmVisionSlot({
  bannerState,
  suggestion,
  groupingMessage,
  catalogMiss = false,
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

  if (!suggestion?.suggestions) {
    if (catalogMiss) {
      return (
        <Banner
          tone="info"
          message="Klubben findes ikke i kataloget endnu. Dit draft bliver gemt."
          action={<Button label="Opgrader (kommer snart)" variant="tertiary" disabled />}
        />
      );
    }

    return <ConfirmVisionBanner state={bannerState} />;
  }

  const message = [
    suggestion.suggestions.clubLabel,
    suggestion.suggestions.seasonLabel,
    suggestion.suggestions.type ? KIT_TYPE_LABELS_DA[suggestion.suggestions.type] : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Animated.View style={{ opacity: suggestionOpacity }}>
      <Banner
        tone="info"
        message={`Forslag: ${message}`}
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

const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    gap: space.gapSm,
  },
});
