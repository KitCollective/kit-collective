import { Ionicons } from "@expo/vector-icons";
import { Image, type ImageSourcePropType, Pressable, StyleSheet, Text, View } from "react-native";
import {
  type JerseyTileBadge,
  type JerseyTileCaption,
  jerseyTileAccessibilityLabel,
  jerseyTileBadgeLabel,
  jerseyTileMetaLine,
} from "@/components/jersey-tile-meta";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type JerseyTileProps = {
  photoSource?: ImageSourcePropType;
  clubLabel: string;
  seasonLabel: string;
  typeLabel: string;
  /** Samling only. Without it the tile keeps the club + season · type caption. */
  caption?: JerseyTileCaption;
  /** Samling only: one badge, top-left on the photo. */
  badge?: JerseyTileBadge | null;
  onPress?: () => void;
  displayOnly?: boolean;
  testID?: string;
};

const LOCK_DISC = 28;

export function JerseyTile({
  photoSource,
  clubLabel,
  seasonLabel,
  typeLabel,
  caption,
  badge,
  onPress,
  displayOnly = false,
  testID,
}: JerseyTileProps) {
  const theme = useTheme();
  const typography = useTypography();
  const metaLine = jerseyTileMetaLine(seasonLabel, typeLabel);
  const accessibilityLabel = jerseyTileAccessibilityLabel({
    clubLabel,
    seasonLabel,
    typeLabel,
    caption,
    badge,
  });

  const content = (
    <>
      <View
        style={[
          styles.photoFrame,
          { backgroundColor: theme.fillSecondary, borderColor: theme.borderSubtle },
        ]}
      >
        {photoSource ? (
          <Image source={photoSource} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={[styles.photoPlaceholder, { backgroundColor: theme.fillSecondary }]} />
        )}
        {badge ? (
          badge.kind === "bids" ? (
            <View
              testID="jersey-tile-badge"
              style={[styles.badge, styles.bidsPill, { backgroundColor: theme.fillPrimary }]}
            >
              <Text style={[typography.labelSm, { color: theme.contentInverse }]}>
                {jerseyTileBadgeLabel(badge)}
              </Text>
            </View>
          ) : (
            <View
              testID="jersey-tile-badge"
              style={[styles.badge, styles.lockDisc, { backgroundColor: theme.fillPrimary }]}
            >
              <Ionicons
                name="lock-closed"
                size={14}
                color={theme.contentInverse}
                accessibilityElementsHidden
              />
            </View>
          )
        ) : null}
      </View>
      {caption ? (
        <View style={styles.captionStack}>
          <View style={styles.leadRow}>
            <Text
              style={[
                caption.leadRole === "club" ? typography.headingSm : typography.mono,
                styles.lead,
                { color: theme.contentPrimary },
              ]}
              numberOfLines={1}
            >
              {caption.lead}
            </Text>
            {caption.trailing ? (
              <Text style={[typography.mono, { color: theme.contentSecondary }]} numberOfLines={1}>
                {caption.trailing}
              </Text>
            ) : null}
          </View>
          <Text
            style={[
              caption.leadRole === "club" ? typography.mono : typography.caption,
              { color: theme.contentSecondary },
            ]}
            numberOfLines={1}
          >
            {caption.secondary}
          </Text>
        </View>
      ) : (
        <View style={styles.captionStack}>
          <Text style={[typography.headingSm, { color: theme.contentPrimary }]} numberOfLines={1}>
            {clubLabel}
          </Text>
          <Text style={[typography.mono, { color: theme.contentSecondary }]} numberOfLines={1}>
            {metaLine}
          </Text>
        </View>
      )}
    </>
  );

  if (displayOnly || !onPress) {
    return (
      <View
        accessibilityLabel={accessibilityLabel}
        importantForAccessibility="yes"
        style={styles.tile}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    gap: space.gapSm,
  },
  tilePressed: {
    opacity: 0.92,
  },
  photoFrame: {
    borderRadius: radius.md,
    overflow: "hidden",
    aspectRatio: 4 / 5,
    borderWidth: 1,
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  photoPlaceholder: {
    flex: 1,
  },
  badge: {
    position: "absolute",
    top: space.insetSm,
    left: space.insetSm,
  },
  bidsPill: {
    borderRadius: radius.pill,
    paddingHorizontal: space.insetSm,
    paddingVertical: 2,
  },
  lockDisc: {
    width: LOCK_DISC,
    height: LOCK_DISC,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  captionStack: {
    gap: space.gapSm,
  },
  leadRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.gapSm,
  },
  lead: {
    flex: 1,
  },
});
