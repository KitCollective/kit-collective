import type { VisionJobResponse } from "@kit/api-contract";
import { KIT_TYPE_LABELS_DA } from "@kit/domain";
import { Animated, StyleSheet, View } from "react-native";
import { Banner } from "@/components/catalog-ui";
import { Button } from "@/components/ui";
import { space } from "@/theme/tokens";

type ConfirmVisionSlotProps = {
  suggestion: VisionJobResponse | null;
  groupingMessage?: string | null;
  suggestionOpacity: Animated.Value;
  onApplySuggestion: () => void;
  onDismissSuggestion: () => void;
};

/**
 * Interactive Brug/Luk only. Identity status lives on the Data row
 * (skeleton + field marks) — not a persistent analyzer Banner.
 */
export function ConfirmVisionSlot({
  suggestion,
  groupingMessage,
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
    return null;
  }

  const message = [
    suggestion.suggestions.clubLabel,
    suggestion.suggestions.seasonLabel,
    suggestion.suggestions.type ? KIT_TYPE_LABELS_DA[suggestion.suggestions.type] : null,
    suggestion.suggestions.playerLabel
      ? suggestion.suggestions.playerNumber
        ? `${suggestion.suggestions.playerLabel} (Nr. ${suggestion.suggestions.playerNumber})`
        : suggestion.suggestions.playerLabel
      : null,
    suggestion.suggestions.patchLabel,
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
