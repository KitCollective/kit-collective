import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Avatar } from "@/components/avatar";
import type { ForeignOwnerRowView } from "@/search/foreign-jersey-view-model";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

const ROW_MIN_HEIGHT = 64;

type ForeignJerseyOwnerRowProps = {
  owner: ForeignOwnerRowView;
  onPress: () => void;
};

/**
 * The owner block, last on a foreign UserJersey (docs/design-system.md → Foreign UserJersey
 * detail, item 5): a `caption` Ejer, then one row with a 44px Avatar, the Handle, a `caption`
 * line (city per Vis by · n trøjer) and a trailing chevron. Opens Peer Profil.
 *
 * The peer jersey response carries no owner photo, so the Avatar shows the initial.
 */
export function ForeignJerseyOwnerRow({ owner, onPress }: ForeignJerseyOwnerRowProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <View style={styles.block} testID="foreign-jersey-owner">
      <Text style={[typography.caption, { color: theme.contentSecondary }]}>
        {owner.sectionCaption}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={owner.accessibilityLabel}
        accessibilityHint="Åbner profilen"
        onPress={onPress}
        testID="foreign-jersey-owner-row"
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.fillSecondary }]}
      >
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Avatar handle={owner.handle} size="sm" />
        </View>
        <View style={styles.text}>
          <Text style={[typography.label, { color: theme.contentPrimary }]} numberOfLines={1}>
            {owner.handle}
          </Text>
          <Text style={[typography.caption, { color: theme.contentSecondary }]} numberOfLines={1}>
            {owner.caption}
          </Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={theme.contentMuted}
          accessibilityElementsHidden
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: space.gapSm,
  },
  row: {
    minHeight: ROW_MIN_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
  },
  text: {
    flex: 1,
  },
});
