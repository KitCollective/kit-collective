import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type {
  IdentityBlockAction,
  IdentityBlockModel,
  IdentityPillTone,
} from "@/capture/confirmIdentityBlock";
import { ConfirmAnalyzingPulse, SKELETON_BONE_ALPHA } from "@/components/confirm-analyzing-pulse";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space, type, withAlpha } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type ConfirmIdentityBlockProps = {
  model: IdentityBlockModel;
  /** Whole block, Ret and Vælg all open the unchanged Data drill. */
  onOpenData: () => void;
  onApplySuggestion: () => void;
  onChooseMyself: () => void;
};

function PillFace({ label, tone }: { label: string; tone: IdentityPillTone }) {
  const theme = useTheme();
  const typography = useTypography();
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: tone === "primary" ? theme.fillPrimary : theme.fillSecondary },
      ]}
    >
      <Text
        style={[
          typography.label,
          { color: tone === "primary" ? theme.contentInverse : theme.contentPrimary },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function Bar({ width, height }: { width: `${number}%`; height: number }) {
  const theme = useTheme();
  return (
    <View style={{ width, height, borderRadius: radius.sm, overflow: "hidden" }}>
      <ConfirmAnalyzingPulse color={withAlpha(theme.fillPrimary, SKELETON_BONE_ALPHA)} />
    </View>
  );
}

/**
 * The Vision result as the headline of Confirm (design lock: Confirm and Save, Revision
 * 2026-10-09, items 2 to 4). Four states from one view-model: resolved, in flight, low
 * confidence, empty. The Data card, its donut and the green banner are gone.
 */
export function ConfirmIdentityBlock({
  model,
  onOpenData,
  onApplySuggestion,
  onChooseMyself,
}: ConfirmIdentityBlockProps) {
  const theme = useTheme();
  const typography = useTypography();
  const labelColor = model.labelTone === "success" ? theme.success : theme.contentSecondary;
  const headlineColor = model.headlineTone === "muted" ? theme.contentMuted : theme.contentPrimary;
  const inFlight = model.kind === "in-flight";
  const clubFact = model.facts.find((fact) => fact.key === "club");
  const restFacts = model.facts.filter((fact) => fact.key !== "club");
  const restLoaded = restFacts.filter((fact) => fact.value);
  const restPending = restFacts.length - restLoaded.length;

  const handleAction = (action: IdentityBlockAction) => {
    if (action === "apply-suggestion") {
      onApplySuggestion();
    } else if (action === "choose-myself") {
      onChooseMyself();
    } else {
      onOpenData();
    }
  };

  return (
    <View testID={`confirm-identity-${model.kind}`} style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={model.accessibilityLabel}
        accessibilityHint="Åbner Data"
        accessibilityState={inFlight ? { busy: true } : undefined}
        testID="confirm-identity-open"
        onPress={onOpenData}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <View style={styles.copy}>
          {model.label ? (
            <View style={styles.labelRow}>
              {model.labelTone === "success" || inFlight ? (
                <Ionicons
                  name="sparkles"
                  size={type.captionSm.lineHeight - 4}
                  color={labelColor}
                  accessibilityElementsHidden
                />
              ) : null}
              <Text numberOfLines={1} style={[typography.captionSm, { color: labelColor }]}>
                {model.label}
              </Text>
            </View>
          ) : null}

          {inFlight && !clubFact?.value ? (
            <Bar width="60%" height={type.display.lineHeight} />
          ) : (
            <Text
              numberOfLines={2}
              style={[typography.display, { color: headlineColor }]}
              testID="confirm-identity-headline"
            >
              {model.headline}
            </Text>
          )}

          {inFlight ? (
            <View style={styles.factRow}>
              {restLoaded.length > 0 ? (
                <Text numberOfLines={1} style={[typography.mono, { color: theme.contentPrimary }]}>
                  {restLoaded.map((fact) => fact.value).join(" · ")}
                </Text>
              ) : null}
              {Array.from({ length: restPending }, (_, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed-size placeholder bars
                <Bar key={index} width="28%" height={type.mono.lineHeight} />
              ))}
            </View>
          ) : (
            <Text
              numberOfLines={2}
              style={[
                typography.mono,
                {
                  color: model.headlineTone === "muted" ? theme.contentMuted : theme.contentPrimary,
                },
              ]}
            >
              {model.monoLine}
            </Text>
          )}
        </View>

        {model.pill ? (
          <View pointerEvents="none" accessibilityElementsHidden>
            <PillFace label={model.pill.label} tone={model.pill.tone} />
          </View>
        ) : null}
      </Pressable>

      {model.actions.length > 0 ? (
        <View style={styles.actions}>
          {model.actions.map((action) => (
            <Pressable
              key={action.action}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              testID={`confirm-identity-${action.action}`}
              onPress={() => handleAction(action.action)}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <PillFace label={action.label} tone={action.tone} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: space.gapMd,
  },
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: space.gapSm / 2,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm / 2,
  },
  factRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.gapSm,
  },
  pill: {
    minHeight: 44,
    borderRadius: radius.pill,
    paddingHorizontal: space.insetMd,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.9,
  },
});
