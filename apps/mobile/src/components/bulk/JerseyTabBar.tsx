import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { CaptureJerseyDraft } from "@/capture/captureSessionTypes";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space, type } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type JerseyTabBarProps = {
  drafts: CaptureJerseyDraft[];
  activeDraftId: string;
  onSelectDraft: (draftId: string) => void;
  onAddJersey: () => void;
};

const TAB_SIZE = 44;

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
          const photoCount = draft.photos.length;
          const jerseyNumber = index + 1;

          return (
            <Pressable
              key={draft.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={`Trøje ${jerseyNumber}, ${photoCount} fotos`}
              onPress={() => onSelectDraft(draft.id)}
              style={({ pressed }) => [
                styles.tab,
                {
                  backgroundColor: selected ? theme.fillPrimary : theme.fillSecondary,
                },
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  typography.label,
                  { color: selected ? theme.contentInverse : theme.contentPrimary },
                ]}
              >
                {jerseyNumber}
              </Text>
              {photoCount > 0 ? (
                <View
                  style={[
                    styles.countBadge,
                    {
                      backgroundColor: selected ? theme.surface : theme.fillPrimary,
                    },
                  ]}
                  accessibilityElementsHidden
                >
                  <Text
                    style={[
                      typography.captionSm,
                      {
                        color: selected ? theme.contentPrimary : theme.contentInverse,
                      },
                    ]}
                  >
                    {photoCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tilføj trøje"
          onPress={onAddJersey}
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: theme.fillSecondary },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="add" size={22} color={theme.contentPrimary} accessibilityElementsHidden />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: TAB_SIZE,
  },
  strip: {
    gap: space.gapSm,
    alignItems: "center",
  },
  addButton: {
    width: TAB_SIZE,
    height: TAB_SIZE,
    borderRadius: radius.pill,
    justifyContent: "center",
    alignItems: "center",
  },
  tab: {
    width: TAB_SIZE,
    height: TAB_SIZE,
    borderRadius: radius.pill,
    justifyContent: "center",
    alignItems: "center",
  },
  pressed: {
    opacity: 0.9,
  },
  countBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: type.captionSm.lineHeight,
    height: type.captionSm.lineHeight,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
