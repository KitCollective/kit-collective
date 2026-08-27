import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { CaptureJerseyDraft } from "@/capture/captureSessionTypes";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type JerseyTabBarProps = {
  drafts: CaptureJerseyDraft[];
  activeDraftId: string;
  onSelectDraft: (draftId: string) => void;
  onAddJersey: () => void;
};

export function JerseyTabBar({
  drafts,
  activeDraftId,
  onSelectDraft,
  onAddJersey,
}: JerseyTabBarProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <View accessibilityRole="tablist" style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      >
        {drafts.map((draft, index) => {
          const selected = draft.id === activeDraftId;
          const label = `Trøje ${index + 1} · ${draft.photos.length}`;

          return (
            <Pressable
              key={draft.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={`Trøje ${index + 1}, ${draft.photos.length} fotos`}
              onPress={() => onSelectDraft(draft.id)}
              style={({ pressed }) => [
                styles.tab,
                {
                  backgroundColor: selected ? theme.fillPrimary : theme.fillSecondary,
                  borderColor: selected ? theme.fillPrimary : theme.borderSubtle,
                },
                pressed && styles.tabPressed,
              ]}
            >
              <Text
                style={[
                  typography.label,
                  { color: selected ? theme.contentInverse : theme.contentSecondary },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tilføj trøje"
          onPress={onAddJersey}
          style={({ pressed }) => [styles.addButton, pressed && styles.tabPressed]}
        >
          <Text style={[typography.label, { color: theme.contentSecondary }]}>+ trøje</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: space.gapLg,
  },
  strip: {
    gap: space.gapSm,
    alignItems: "center",
  },
  tab: {
    minHeight: 44,
    paddingHorizontal: space.insetMd,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  tabPressed: {
    opacity: 0.9,
  },
  addButton: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: space.insetSm,
    justifyContent: "center",
    alignItems: "center",
  },
});
