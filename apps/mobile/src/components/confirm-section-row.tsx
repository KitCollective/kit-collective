import { Ionicons } from "@expo/vector-icons";
import type { LayoutChangeEvent } from "react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ConfirmSectionFact } from "@/capture/confirmSectionProgress";
import type { ConfirmVisionFieldMark } from "@/capture/confirmVisionFieldMarks";
import { ConfirmProgressDonut } from "@/components/confirm-progress-donut";
import {
  ConfirmAnalyzingPulse,
  SKELETON_BONE_ALPHA,
} from "@/components/confirm-analyzing-pulse";
import { useTypography } from "@/theme/brand-fonts";
import type { ThemeColors } from "@/theme/tokens";
import { radius, space, withAlpha } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

function spokenVisionMark(
  placeholder: string,
  mark: ConfirmVisionFieldMark | undefined,
): string | null {
  switch (mark) {
    case "review":
      return `AI foreslog ${placeholder}, tjek i Data`;
    case "pending":
      return `AI kigger på ${placeholder}`;
    case "hit":
      return `AI ramte ${placeholder}`;
    case "miss":
      return `AI fandt ikke ${placeholder}`;
    case "rejected":
      return `Du rettede ${placeholder}`;
    default:
      return null;
  }
}

function visionMarkIcon(mark: ConfirmVisionFieldMark): keyof typeof Ionicons.glyphMap {
  switch (mark) {
    case "review":
      return "eye-outline";
    case "pending":
      return "sparkles";
    case "hit":
      return "checkmark";
    case "miss":
      return "close";
    case "rejected":
      return "sparkles";
    default: {
      const _exhaustive: never = mark;
      return _exhaustive;
    }
  }
}

function visionMarkColor(theme: ThemeColors, mark: ConfirmVisionFieldMark): string {
  switch (mark) {
    case "hit":
      return theme.contentPrimary;
    case "pending":
    case "review":
    case "miss":
    case "rejected":
      return theme.contentMuted;
    default: {
      const _exhaustive: never = mark;
      return _exhaustive;
    }
  }
}

type ConfirmSectionRowProps = {
  title: string;
  facts: ConfirmSectionFact[];
  filled: number;
  required: number;
  /** Identity in flight — capsule skeletons replace Data facts. Detaljer never sets this. */
  loading?: boolean;
  /** Shared height so Data and Detaljer read as a matched, equal pair. */
  minHeight?: number;
  onPress: () => void;
  /** Reports the card's natural height so the pair can equalise both. */
  onMeasureHeight?: (height: number) => void;
};

const DATA_SKELETON_WIDTHS = [56, 64, 48, 72];

export function ConfirmSectionRow({
  title,
  facts,
  filled,
  required,
  loading = false,
  minHeight,
  onPress,
  onMeasureHeight,
}: ConfirmSectionRowProps) {
  const theme = useTheme();
  const typography = useTypography();
  const spokenFacts = facts
    .map((fact) => {
      const base = fact.value ? fact.value : `${fact.placeholder} mangler`;
      const mark = spokenVisionMark(fact.placeholder, fact.visionMark);
      return mark ? `${base}. ${mark}` : base;
    })
    .join(". ");

  const handleLayout = (event: LayoutChangeEvent) => {
    onMeasureHeight?.(event.nativeEvent.layout.height);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        loading
          ? `${title}, analyserer`
          : `${title}, ${filled} af ${required} udfyldt. ${spokenFacts}`
      }
      accessibilityState={loading ? { busy: true } : undefined}
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
          {loading
            ? DATA_SKELETON_WIDTHS.map((width) => (
                <View key={width} pointerEvents="none" style={[styles.skeletonFact, { width }]}>
                  <ConfirmAnalyzingPulse
                    color={withAlpha(theme.contentPrimary, SKELETON_BONE_ALPHA)}
                  />
                </View>
              ))
            : facts.map((fact) => (
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
                  {fact.visionMark ? (
                    <Ionicons
                      name={visionMarkIcon(fact.visionMark)}
                      size={12}
                      color={visionMarkColor(theme, fact.visionMark)}
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                    />
                  ) : null}
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
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm,
    borderRadius: radius.pill,
    paddingHorizontal: space.insetSm,
    maxWidth: "100%",
  },
  skeletonFact: {
    height: 18,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
});
