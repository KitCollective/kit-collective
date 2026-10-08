import {
  JERSEY_CONDITION_LABELS_DA,
  JERSEY_CONDITIONS,
  JERSEY_SIZE_LABELS_DA,
  JERSEY_SIZES,
} from "@kit/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { selectDraftCondition, selectDraftSize, setDraftNotes } from "@/capture/captureSession";
import { useConfirmExit } from "@/capture/use-confirm-exit";
import { useConfirmSave } from "@/capture/useConfirmSave";
import { Chip } from "@/components/chip";
import { ConfirmDrillHeader } from "@/components/confirm-drill-header";
import { TextField } from "@/components/profile-ui";
import { BUTTON_DOCK_FADE_SCROLL_PADDING, Button, ButtonDock } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export function ConfirmDetailsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const { sessionId, editJerseyId } = useLocalSearchParams<{
    sessionId: string;
    editJerseyId?: string;
  }>();
  const { state, isSessionResolved, mutate, draft, handleCommitDrill } = useConfirmSave({
    sessionId,
    editJerseyId,
  });
  useConfirmExit(sessionId, state, isSessionResolved);

  if (!sessionId || !draft) {
    return null;
  }

  const fadeDockScrollPadding =
    BUTTON_DOCK_FADE_SCROLL_PADDING + Math.max(insets.bottom, space.insetMd);

  return (
    <View style={[styles.container, { backgroundColor: theme.canvas }]}>
      <ConfirmDrillHeader title="Detaljer" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: fadeDockScrollPadding }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <Text style={[typography.label, { color: theme.contentPrimary }]}>Størrelse</Text>
          <View style={styles.chipRow}>
            {JERSEY_SIZES.map((value) => (
              <Chip
                key={value}
                label={JERSEY_SIZE_LABELS_DA[value]}
                selected={draft.sizeSelected && draft.size === value}
                accessibilityRole="radio"
                onPress={() => {
                  mutate((current) => selectDraftSize(current, current.activeDraftId, value));
                }}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[typography.label, { color: theme.contentPrimary }]}>Stand</Text>
          <View style={styles.chipRow}>
            {JERSEY_CONDITIONS.map((value) => (
              <Chip
                key={value}
                label={JERSEY_CONDITION_LABELS_DA[value]}
                selected={draft.conditionSelected && draft.condition === value}
                accessibilityRole="radio"
                onPress={() => {
                  mutate((current) => selectDraftCondition(current, current.activeDraftId, value));
                }}
              />
            ))}
          </View>
        </View>

        <TextField
          label="Noter"
          meta="Valgfrit"
          value={draft.notes}
          onChangeText={(text) => {
            mutate((current) => setDraftNotes(current, current.activeDraftId, text));
          }}
          multiline
        />
      </ScrollView>

      <ButtonDock variant="fade">
        <Button label="Gem" variant="primary" width="fill" onPress={handleCommitDrill} />
      </ButtonDock>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: space.insetLg,
    gap: space.gapLg,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.gapSm,
  },
  section: {
    gap: space.gapSm,
  },
});
