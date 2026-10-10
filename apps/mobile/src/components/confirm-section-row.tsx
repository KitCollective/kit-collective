import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type ConfirmSectionRowProps = {
  title: string;
  /** Muted trailing qualifier, e.g. "valgfrit". */
  meta?: string;
  onPress: () => void;
  testID?: string;
};

/**
 * The one quiet row on the hub that reaches the Detaljer drill (design lock: Confirm and Save,
 * Revision 2026-10-09, item 1). No donut, no fact capsules: it holds nothing Gem requires.
 */
export function ConfirmSectionRow({ title, meta, onPress, testID }: ConfirmSectionRowProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={meta ? `${title}, ${meta}` : title}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? theme.fillSecondary : theme.surface,
          borderColor: theme.borderSubtle,
        },
      ]}
    >
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[typography.label, { color: theme.contentPrimary }]}>
          {title}
          {meta ? (
            <Text style={[typography.label, { color: theme.contentMuted }]}>{` · ${meta}`}</Text>
          ) : null}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.contentMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
    paddingHorizontal: space.insetMd,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
});
