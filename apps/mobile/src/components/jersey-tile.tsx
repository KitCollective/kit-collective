import { Image, type ImageSourcePropType, Pressable, StyleSheet, Text, View } from "react-native";
import { jerseyTileMetaLine } from "@/components/jersey-tile-meta";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type JerseyTileProps = {
  photoSource?: ImageSourcePropType;
  clubLabel: string;
  seasonLabel: string;
  typeLabel: string;
  onPress?: () => void;
};

export function JerseyTile({
  photoSource,
  clubLabel,
  seasonLabel,
  typeLabel,
  onPress,
}: JerseyTileProps) {
  const theme = useTheme();
  const typography = useTypography();
  const metaLine = jerseyTileMetaLine(seasonLabel, typeLabel);
  const accessibilityLabel = `${clubLabel}, ${metaLine}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
    >
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
      </View>
      <View style={styles.captionStack}>
        <Text style={[typography.headingSm, { color: theme.contentPrimary }]} numberOfLines={1}>
          {clubLabel}
        </Text>
        <Text style={[typography.mono, { color: theme.contentSecondary }]} numberOfLines={1}>
          {metaLine}
        </Text>
      </View>
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
  captionStack: {
    gap: space.gapSm,
  },
});
