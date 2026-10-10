import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { setDraftNotes } from "@/capture/captureSession";
import { useConfirmExit } from "@/capture/use-confirm-exit";
import { useConfirmSave } from "@/capture/useConfirmSave";
import { ConfirmBadgeSection } from "@/components/confirm-badge-section";
import { ConfirmDrillHeader } from "@/components/confirm-drill-header";
import { TextField } from "@/components/profile-ui";
import { BUTTON_DOCK_FADE_SCROLL_PADDING, Button, ButtonDock } from "@/components/ui";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

/**
 * Detaljer drill: only the optional Badge and Noter. Size and condition moved to the hub
 * (design lock: Confirm and Save, Revision 2026-10-09, item 1).
 */
export function ConfirmDetailsScreen() {
  const router = useRouter();
  const theme = useTheme();
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
        <ConfirmBadgeSection draft={draft} mutate={mutate} />

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
        <Button
          label="Gem"
          variant="primary"
          width="fill"
          onPress={handleCommitDrill}
          testID="confirm-details-save"
        />
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
});
