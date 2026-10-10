import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

const THUMB_WIDTH = space.insetLg + space.insetSm;
const THUMB_HEIGHT = (THUMB_WIDTH * 5) / 4;
const THUMB_OVERLAP = space.gapSm;

type SessionSummaryRowProps = {
  thumbUris: string[];
  title: string;
  caption?: string | null;
  /** The `fill.primary` pill on the trailing edge. The whole row is one press. */
  pillLabel: string;
  onPress: () => void;
  testID: string;
};

/**
 * The summary row both ends of a capture session share: the overview's inbox row (**4 fotos uden
 * trøje**, **Sortér**) and Samling's parked row (**3 trøjer mangler**, **Fortsæt**). `fill.secondary`,
 * `radius.md`, overlapping 4:5 thumbs, a `heading-sm` title, a `caption` line, a pill.
 */
export function SessionSummaryRow({
  thumbUris,
  title,
  caption,
  pillLabel,
  onPress,
  testID,
}: SessionSummaryRowProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={caption ? `${title}. ${caption}. ${pillLabel}` : `${title}. ${pillLabel}`}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.fillSecondary },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.thumbs} accessibilityElementsHidden>
        {thumbUris.map((uri, index) => (
          <Image
            key={uri}
            source={{ uri }}
            accessibilityIgnoresInvertColors
            style={[
              styles.thumb,
              {
                backgroundColor: theme.borderSubtle,
                borderColor: theme.fillSecondary,
                marginLeft: index === 0 ? 0 : -THUMB_OVERLAP,
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[typography.headingSm, { color: theme.contentPrimary }]}>
          {title}
        </Text>
        {caption ? (
          <Text numberOfLines={1} style={[typography.caption, { color: theme.contentSecondary }]}>
            {caption}
          </Text>
        ) : null}
      </View>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        style={[styles.pill, { backgroundColor: theme.fillPrimary }]}
      >
        <Text style={[typography.label, { color: theme.contentInverse }]}>{pillLabel}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
    padding: space.insetSm,
    borderRadius: radius.md,
  },
  pressed: {
    opacity: 0.9,
  },
  thumbs: {
    flexDirection: "row",
  },
  thumb: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  pill: {
    minHeight: 44,
    borderRadius: radius.pill,
    paddingHorizontal: space.insetMd,
    alignItems: "center",
    justifyContent: "center",
  },
});
