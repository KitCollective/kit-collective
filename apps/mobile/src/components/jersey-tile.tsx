import { Image, type ImageSourcePropType, Pressable, StyleSheet, Text, View } from "react-native";
import { color, radius, space, type } from "@/theme/tokens";

type JerseyTileProps = {
  photoSource?: ImageSourcePropType;
  clubLabel: string;
  seasonLabel: string;
  onPress?: () => void;
};

export function JerseyTile({ photoSource, clubLabel, seasonLabel, onPress }: JerseyTileProps) {
  const caption = `${clubLabel} · ${seasonLabel}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={caption}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
    >
      <View style={styles.photoFrame}>
        {photoSource ? (
          <Image source={photoSource} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={styles.photoPlaceholder} />
        )}
      </View>
      <Text style={styles.caption} numberOfLines={2}>
        {caption}
      </Text>
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
    backgroundColor: color.fillSecondary,
    aspectRatio: 4 / 5,
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  photoPlaceholder: {
    flex: 1,
    backgroundColor: color.fillSecondary,
  },
  caption: {
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    color: color.contentSecondary,
  },
});
