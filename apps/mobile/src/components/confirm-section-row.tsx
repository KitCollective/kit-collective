import { Ionicons } from "@expo/vector-icons";
import type { LayoutChangeEvent } from "react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ConfirmSectionFact } from "@/capture/confirmSectionProgress";
import { ConfirmProgressDonut } from "@/components/confirm-progress-donut";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type ConfirmSectionRowProps = {
  title: string;
  facts: ConfirmSectionFact[];
  filled: number;
  required: number;
  /** Shared height so Data and Detaljer read as a matched, equal pair. */
  minHeight?: number;
  onPress: () => void;
  /** Reports the card's natural height so the pair can equalise both. */
  onMeasureHeight?: (height: number) => void;
};

export function ConfirmSectionRow({
  title,
  facts,
  filled,
  required,
  minHeight,
  onPress,
  onMeasureHeight,
}: ConfirmSectionRowProps) {
  const theme = useTheme();
  const typography = useTypography();
  const spokenFacts = facts
    .map((fact) => (fact.value ? fact.value : `${fact.placeholder} mangler`))
    .join(". ");

  const handleLayout = (event: LayoutChangeEvent) => {
    onMeasureHeight?.(event.nativeEvent.layout.height);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${filled} af ${required} udfyldt. ${spokenFacts}`}
      onPress={onPress}
      onLayout={handleLayout}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? theme.fillSecondary : theme.surface,
          borderColor: theme.borderSubtle,
          minHeight,
        },
      ]}
    >
      <ConfirmProgressDonut filled={filled} required={required} />
      <View style={styles.body}>
        <Text numberOfLines={1} style={[typography.label, { color: theme.contentPrimary }]}>
          {title}
        </Text>
        <View style={styles.facts}>
          {facts.map((fact) => (
            <View
              key={fact.key}
              pointerEvents="none"
              style={[
                styles.fact,
                fact.value
                  ? { backgroundColor: theme.fillSecondary }
                  : { borderColor: theme.borderSubtle, borderWidth: 1, borderStyle: "dashed" },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  typography.captionSm,
                  { color: fact.value ? theme.contentPrimary : theme.contentMuted },
                ]}
              >
                {fact.value ?? fact.placeholder}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.contentMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
    paddingHorizontal: space.insetMd,
    paddingVertical: space.insetMd,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: space.gapSm,
  },
  facts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.gapSm,
  },
  fact: {
    borderRadius: radius.pill,
    paddingHorizontal: space.insetSm,
    maxWidth: "100%",
  },
});
