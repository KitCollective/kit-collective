import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { resolvePeerAvatarUrl } from "@/api/peer-profile";
import { Avatar } from "@/components/avatar";
import { NumberEmblem } from "@/components/number-emblem";
import { searchTilePhotoSource } from "@/search/search-tile-photo";
import type { SearchHit, SearchHitLeading } from "@/search/search-view-model";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

/** Row height and leading slot from docs/design-system.md → Søg home and typeahead. */
const ROW_HEIGHT = 64;
const LEADING_SLOT = 44;

type TypeaheadHitRowProps = {
  hit: SearchHit;
  accessToken: string | null | undefined;
  onPress: () => void;
};

function LeadingSlot({
  leading,
  accessToken,
}: {
  leading: SearchHitLeading;
  accessToken: string | null | undefined;
}) {
  const theme = useTheme();
  const typography = useTypography();

  switch (leading.kind) {
    case "number":
      return <NumberEmblem size="md" state="rest" number={leading.number} />;
    case "thumb":
      return (
        <Image
          accessibilityIgnoresInvertColors
          source={searchTilePhotoSource(leading.photo, accessToken)}
          resizeMode="cover"
          style={[styles.thumb, { backgroundColor: theme.fillSecondary }]}
        />
      );
    case "avatar": {
      const avatarUri = resolvePeerAvatarUrl(leading.avatarUrl);
      // Avatar has no 44 size (`md` is 56, the closest); the centred slot lets it overhang evenly
      // so the text column stays aligned with the other rows. Flagged as a design gap.
      return (
        <Avatar
          handle={leading.handle}
          uri={avatarUri}
          uriHeaders={
            accessToken && avatarUri ? { Authorization: `Bearer ${accessToken}` } : undefined
          }
          size="md"
        />
      );
    }
    case "initials":
      return (
        <View style={[styles.initials, { backgroundColor: theme.fillSecondary }]}>
          <Text style={[typography.label, { color: theme.contentPrimary }]}>{leading.label}</Text>
        </View>
      );
    default: {
      const _exhaustive: never = leading;
      return _exhaustive;
    }
  }
}

/**
 * One hit of the typeahead list (docs/design-system.md → Søg home and typeahead, Revision
 * 2026-10-10): 64 high, a 44px leading slot, the name, the kind as a caption, a hairline
 * under it. Not List row: that is 44 high with a Mark and a chevron.
 */
export function TypeaheadHitRow({ hit, accessToken, onPress }: TypeaheadHitRowProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hit.accessibilityLabel}
      testID={`typeahead-hit-${hit.key}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.borderSubtle },
        pressed && { backgroundColor: theme.fillSecondary },
      ]}
    >
      <View
        style={styles.leading}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <LeadingSlot leading={hit.leading} accessToken={accessToken} />
      </View>
      <View style={styles.text}>
        <Text style={[typography.label, { color: theme.contentPrimary }]} numberOfLines={1}>
          {hit.name}
        </Text>
        <Text style={[typography.caption, { color: theme.contentSecondary }]} numberOfLines={1}>
          {hit.caption}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
    height: ROW_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  leading: {
    width: LEADING_SLOT,
    height: LEADING_SLOT,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    flex: 1,
  },
  thumb: {
    width: LEADING_SLOT,
    height: LEADING_SLOT,
    borderRadius: radius.sm,
  },
  initials: {
    width: LEADING_SLOT,
    height: LEADING_SLOT,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});
